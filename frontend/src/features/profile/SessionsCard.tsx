import { Badge, Button, Card, ListGroup, Placeholder } from 'react-bootstrap';
import toast from 'react-hot-toast';
import {
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
} from '@/features/auth/authApi';
import { errorMessage } from '@/lib/apiError';
import { formatIp, formatRelative } from '@/lib/format';

function deviceIcon(label: string): string {
  if (/Android|iOS/.test(label)) return 'bi-phone';
  if (/Postman|curl|API client/.test(label)) return 'bi-terminal';
  return 'bi-laptop';
}

export function SessionsCard() {
  const { data: sessions, isLoading } = useSessionsQuery();
  const [revoke, revokeState] = useRevokeSessionMutation();
  const [revokeOthers, othersState] = useRevokeOtherSessionsMutation();
  const others = sessions?.filter((s) => !s.current).length ?? 0;

  const signOut = async (id: string) => {
    try {
      await revoke(id).unwrap();
      toast.success('Device signed out');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const signOutOthers = async () => {
    try {
      const { signedOut } = await revokeOthers().unwrap();
      toast.success(`${signedOut} device(s) signed out`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div>
            <h2 className="h6 mb-1">Signed-in devices</h2>
            <p className="small text-body-secondary mb-0">
              Sign out any device you don't recognise, then change your password.
            </p>
          </div>
          {others > 0 && (
            <Button
              variant="outline-danger"
              size="sm"
              onClick={signOutOthers}
              disabled={othersState.isLoading}
            >
              Sign out others
            </Button>
          )}
        </div>
        {isLoading ? (
          <Placeholder as="div" animation="glow">
            <Placeholder xs={12} className="rounded mb-2" style={{ height: 48 }} />
            <Placeholder xs={12} className="rounded" style={{ height: 48 }} />
          </Placeholder>
        ) : (
          <ListGroup variant="flush">
            {sessions?.map((session) => (
              <ListGroup.Item key={session.id} className="px-0 d-flex align-items-center gap-3">
                <span className="icon-tile icon-tile-secondary">
                  <i className={`bi ${deviceIcon(session.deviceLabel)}`} aria-hidden="true" />
                </span>
                <div className="flex-grow-1 min-w-0">
                  <div className="fw-medium small">
                    {session.deviceLabel}
                    {session.current && (
                      <Badge
                        bg="success-subtle"
                        text="success-emphasis"
                        className="ms-2 rounded-pill"
                      >
                        This device
                      </Badge>
                    )}
                  </div>
                  <div className="small text-body-secondary">
                    {formatIp(session.ip)} · active {formatRelative(session.lastUsedAt)}
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger"
                    onClick={() => signOut(session.id)}
                    disabled={revokeState.isLoading}
                  >
                    Sign out
                  </Button>
                )}
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}
