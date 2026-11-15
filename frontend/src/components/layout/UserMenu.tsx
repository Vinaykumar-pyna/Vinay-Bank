import { Dropdown } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { useLogoutMutation } from '@/features/auth/authApi';
import { isStaffRole, ROLE_LABELS } from '@/features/auth/types';
import { initials } from '@/lib/format';

export function UserMenu() {
  const user = useAppSelector((state) => state.auth.user);
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();
  if (!user) return null;

  const base = isStaffRole(user.role) ? '/staff' : '/app';

  const signOut = async () => {
    try {
      await logout().unwrap();
    } catch {
      // The local session is cleared either way.
    }
    toast.success('You have been signed out securely');
    navigate('/login', { replace: true });
  };

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        className="d-flex align-items-center gap-2 text-body text-decoration-none p-1"
        id="user-menu"
        aria-label="Account menu"
      >
        <span className="avatar">{initials(user.firstName, user.lastName)}</span>
        <span className="d-none d-md-inline fw-medium">{user.firstName}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="shadow border-0" style={{ minWidth: 260 }}>
        <div className="px-3 py-2">
          <div className="fw-semibold">{user.fullName}</div>
          <div className="small text-body-secondary text-truncate">{user.email}</div>
          <div className="small mt-1">
            <span className="badge rounded-pill text-bg-primary">{ROLE_LABELS[user.role]}</span>
            {user.customerId && (
              <span className="ms-2 text-body-secondary font-mono">ID {user.customerId}</span>
            )}
            {user.employeeId && (
              <span className="ms-2 text-body-secondary font-mono">{user.employeeId}</span>
            )}
          </div>
        </div>
        <Dropdown.Divider />
        <Dropdown.Item as={Link} to={`${base}/profile`}>
          <i className="bi bi-shield-lock me-2" aria-hidden="true" />
          Profile and security
        </Dropdown.Item>
        <Dropdown.Item onClick={signOut} className="text-danger">
          <i className="bi bi-box-arrow-right me-2" aria-hidden="true" />
          Sign out
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
