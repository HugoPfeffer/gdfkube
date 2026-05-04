// NewRequest — thin wrapper that picks formId from routeParams and delegates
// to GenericRequest. Per spec there is no bespoke ClusterRequest component.

import { GenericRequest } from '../forms/GenericRequest';
import type { Navigate } from '../router';
import type { Toast } from '../shell/ToastStack';
import type { Role, User } from '../types';

interface NewRequestProps {
  formId?: string;
  navigate: Navigate;
  setToast: (t: Toast) => void;
  user: User;
  role: Role;
}

export function NewRequest({
  formId,
  navigate,
  setToast,
  user,
  role,
}: NewRequestProps) {
  if (!formId) {
    return <div className="page-placeholder">No form selected</div>;
  }
  return (
    <GenericRequest
      formId={formId}
      navigate={navigate}
      setToast={setToast}
      user={user}
      role={role}
    />
  );
}

export default NewRequest;
