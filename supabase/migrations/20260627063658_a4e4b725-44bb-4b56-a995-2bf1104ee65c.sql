-- Promote any existing staff users to admin and remove staff role usage going forward.
UPDATE public.user_roles SET role = 'admin' WHERE role = 'staff';
-- Deduplicate (in case a user already had both)
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.role = b.role;

-- Update approval function so approving a pending user always grants admin.
CREATE OR REPLACE FUNCTION public.approve_pending_user(_approval_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;
  SELECT user_id INTO v_user FROM public.pending_approvals WHERE id = _approval_id;
  IF v_user IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin')
    ON CONFLICT DO NOTHING;
  UPDATE public.pending_approvals SET status = 'approved', approved_at = now() WHERE id = _approval_id;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_pending_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_pending_user(uuid) TO authenticated;