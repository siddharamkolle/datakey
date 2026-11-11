-- ==============================================================================
-- DATAKEY ARCHITECTURE V2.2 MIGRATION
-- Database: PostgreSQL 15+ (Supabase)
-- Strict Zero-Knowledge Vault + Emergency Public Access Engine
-- ==============================================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. VAULT FOLDERS (Composite key: user_id, id)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vault_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_vault_folders_user_id_id UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_vault_folders_user_id ON public.vault_folders(user_id);

-- ------------------------------------------------------------------------------
-- 2. VAULT ENVELOPES (Holds wrapped VEK under KEK_pass and KEK_recov)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vault_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    key_version INTEGER NOT NULL DEFAULT 1,
    wrapped_vek_pass TEXT NOT NULL,
    salt_vault TEXT NOT NULL,
    iv_pass TEXT NOT NULL,
    argon_memory INTEGER NOT NULL,
    argon_iterations INTEGER NOT NULL,
    wrapped_vek_recov TEXT NOT NULL,
    salt_recov TEXT NOT NULL,
    iv_recov TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vault_envelopes_user_id ON public.vault_envelopes(user_id);

-- ------------------------------------------------------------------------------
-- 3. VAULT RECORDS (Zero-knowledge encrypted ciphertext payloads)
-- Composite foreign key to vault_folders prevents crossing user boundaries
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vault_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id UUID,
    record_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('login', 'note', 'medical', 'file_manifest', 'emergency', 'system')),
    ciphertext TEXT NOT NULL,
    salt TEXT NOT NULL,
    nonce TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_vault_records_user_record UNIQUE (user_id, record_id),
    CONSTRAINT fk_vault_records_folder FOREIGN KEY (user_id, folder_id)
        REFERENCES public.vault_folders(user_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_records_user_cat ON public.vault_records(user_id, category);
CREATE INDEX IF NOT EXISTS idx_vault_records_deleted_at ON public.vault_records(deleted_at) WHERE deleted_at IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 4. PUBLIC PROFILES (Emergency identity & Lost Mode configuration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    public_token TEXT NOT NULL UNIQUE,
    lost_mode BOOLEAN NOT NULL DEFAULT false,
    owner_name TEXT NOT NULL,
    masked_phone TEXT,
    blood_group TEXT,
    allergies TEXT,
    critical_medical_notes TEXT,
    emergency_instructions TEXT DEFAULT 'If you find this keychain, please submit your contact details and location. The owner will be notified immediately.',
    visibility_settings JSONB NOT NULL DEFAULT '{"owner_name": true, "masked_phone": true, "blood_group": false, "allergies": false, "medical_notes": false}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_public_profiles_token ON public.public_profiles(public_token);

-- ------------------------------------------------------------------------------
-- 5. PUBLIC EMERGENCY CONTACTS (Emergency contacts managed in vault)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user ON public.public_emergency_contacts(user_id);

-- ------------------------------------------------------------------------------
-- 6. FINDER TRANSMISSIONS (NO IP ADDRESSES STORED)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finder_transmissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_token TEXT NOT NULL,
    message TEXT NOT NULL,
    finder_contact TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    location_denied BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_finder_transmissions_user ON public.finder_transmissions(user_id);
CREATE INDEX IF NOT EXISTS idx_finder_transmissions_created ON public.finder_transmissions(created_at);

-- ------------------------------------------------------------------------------
-- 7. HARDENED SERVER FUNCTION: GET PUBLIC SCAN PROFILE
-- SECURITY DEFINER, empty search_path, explicit columns, strips sensitive fields in Lost Mode
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_scan_profile(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile RECORD;
    v_contacts JSONB;
    v_result JSONB;
BEGIN
    -- Query profile matching token
    SELECT 
        p.user_id,
        p.public_token,
        p.lost_mode,
        p.owner_name,
        p.masked_phone,
        p.blood_group,
        p.allergies,
        p.critical_medical_notes,
        p.emergency_instructions,
        p.visibility_settings
    INTO v_profile
    FROM public.public_profiles p
    WHERE p.public_token = p_token;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- If LOST MODE is ACTIVE: Strip all personal medical data & emergency contacts
    -- Only return lost warning, instruction, and safe communication channel
    IF v_profile.lost_mode = true THEN
        RETURN jsonb_build_object(
            'public_token', v_profile.public_token,
            'lost_mode', true,
            'owner_name', CASE WHEN (v_profile.visibility_settings->>'owner_name')::boolean IS TRUE THEN v_profile.owner_name ELSE 'DataKey Owner' END,
            'masked_phone', NULL,
            'emergency_instructions', COALESCE(v_profile.emergency_instructions, 'THIS KEYCHAIN HAS BEEN MARKED AS LOST. Please use the form below to transmit your location to the owner.'),
            'blood_group', NULL,
            'allergies', NULL,
            'critical_medical_notes', NULL,
            'emergency_contacts', '[]'::jsonb
        );
    END IF;

    -- Normal mode: Collect emergency contacts if enabled
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'relationship', c.relationship,
            'phone', c.phone,
            'priority', c.priority
        ) ORDER BY c.priority ASC
    ), '[]'::jsonb)
    INTO v_contacts
    FROM public.public_emergency_contacts c
    WHERE c.user_id = v_profile.user_id
      AND c.is_public = true;

    -- Assemble response respecting granular visibility flags
    v_result := jsonb_build_object(
        'public_token', v_profile.public_token,
        'lost_mode', false,
        'owner_name', CASE WHEN (v_profile.visibility_settings->>'owner_name')::boolean IS TRUE THEN v_profile.owner_name ELSE NULL END,
        'masked_phone', CASE WHEN (v_profile.visibility_settings->>'masked_phone')::boolean IS TRUE THEN v_profile.masked_phone ELSE NULL END,
        'emergency_instructions', v_profile.emergency_instructions,
        'blood_group', CASE WHEN (v_profile.visibility_settings->>'blood_group')::boolean IS TRUE THEN v_profile.blood_group ELSE NULL END,
        'allergies', CASE WHEN (v_profile.visibility_settings->>'allergies')::boolean IS TRUE THEN v_profile.allergies ELSE NULL END,
        'critical_medical_notes', CASE WHEN (v_profile.visibility_settings->>'medical_notes')::boolean IS TRUE THEN v_profile.critical_medical_notes ELSE NULL END,
        'emergency_contacts', v_contacts
    );

    RETURN v_result;
END;
$$;

-- Revoke all public execution; will be called by Next.js server role or route handler
REVOKE ALL ON FUNCTION public.get_public_scan_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_scan_profile(TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. REGISTRATION GATING (Single Owner Enforcement)
-- Restricts signups once the first owner account is registered
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_registration_allowed()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.vault_envelopes;
    RETURN v_count = 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_registration_allowed() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict AAL2 Restrictive Policies on All Vault Data
-- ------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.vault_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finder_transmissions ENABLE ROW LEVEL SECURITY;

-- Revoke direct permissions for anon role on sensitive tables
REVOKE ALL ON public.vault_folders FROM anon;
REVOKE ALL ON public.vault_envelopes FROM anon;
REVOKE ALL ON public.vault_records FROM anon;
REVOKE ALL ON public.public_emergency_contacts FROM anon;
REVOKE ALL ON public.finder_transmissions FROM anon;

-- AAL2 Restrictive Policy helper
-- (select auth.jwt()->>'aal') = 'aal2'
CREATE OR REPLACE FUNCTION public.is_aal2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (COALESCE(auth.jwt()->>'aal', 'aal1')) = 'aal2';
$$;

-- VAULT FOLDERS POLICIES
CREATE POLICY "vault_folders_owner_select" ON public.vault_folders
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "vault_folders_owner_insert" ON public.vault_folders
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "vault_folders_owner_update" ON public.vault_folders
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2())
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "vault_folders_owner_delete" ON public.vault_folders
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

-- VAULT ENVELOPES POLICIES
-- Allows initial insert during registration or envelope read/update with AAL2
CREATE POLICY "vault_envelopes_owner_select" ON public.vault_envelopes
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "vault_envelopes_owner_insert" ON public.vault_envelopes
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "vault_envelopes_owner_update" ON public.vault_envelopes
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2())
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

-- VAULT RECORDS POLICIES (Strict AAL2 required)
CREATE POLICY "vault_records_owner_select" ON public.vault_records
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "vault_records_owner_insert" ON public.vault_records
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "vault_records_owner_update" ON public.vault_records
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2())
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "vault_records_owner_delete" ON public.vault_records
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

-- PUBLIC PROFILES POLICIES
CREATE POLICY "public_profiles_owner_select" ON public.public_profiles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "public_profiles_owner_insert" ON public.public_profiles
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "public_profiles_owner_update" ON public.public_profiles
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2())
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

-- PUBLIC EMERGENCY CONTACTS POLICIES
CREATE POLICY "emergency_contacts_owner_select" ON public.public_emergency_contacts
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "emergency_contacts_owner_insert" ON public.public_emergency_contacts
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "emergency_contacts_owner_update" ON public.public_emergency_contacts
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2())
    WITH CHECK (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "emergency_contacts_owner_delete" ON public.public_emergency_contacts
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

-- FINDER TRANSMISSIONS POLICIES (Owner view only)
CREATE POLICY "finder_transmissions_owner_select" ON public.finder_transmissions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

CREATE POLICY "finder_transmissions_owner_delete" ON public.finder_transmissions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND public.is_aal2());

-- Note: Finder transmissions insertion is performed via server-side service role client in /api/finder/transmit

-- ------------------------------------------------------------------------------
-- 10. RETENTION PURGE FUNCTION (Purges 30-day soft deleted records & transmissions)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_retention(retention_days INTEGER DEFAULT 30)
RETURNS TABLE(purged_records_count INTEGER, purged_transmissions_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    r_count INTEGER;
    t_count INTEGER;
BEGIN
    -- Delete records soft-deleted more than 30 days ago
    WITH deleted_rows AS (
        DELETE FROM public.vault_records
        WHERE deleted_at IS NOT NULL
          AND deleted_at < (timezone('utc'::text, now()) - (retention_days || ' days')::INTERVAL)
        RETURNING id
    )
    SELECT COUNT(*) INTO r_count FROM deleted_rows;

    -- Delete finder transmissions older than 30 days
    WITH purged_transmissions AS (
        DELETE FROM public.finder_transmissions
        WHERE created_at < (timezone('utc'::text, now()) - (retention_days || ' days')::INTERVAL)
        RETURNING id
    )
    SELECT COUNT(*) INTO t_count FROM purged_transmissions;

    RETURN QUERY SELECT r_count, t_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_retention(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_retention(INTEGER) TO service_role;

