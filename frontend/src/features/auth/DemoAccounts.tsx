import { Accordion, Badge } from 'react-bootstrap';

export const DEMO_PASSWORD = 'Demo@1234';

const accounts = [
  { email: 'priya@example.com', name: 'Priya Sharma', role: 'Customer', note: 'KYC verified' },
  { email: 'rahul@example.com', name: 'Rahul Verma', role: 'Customer', note: 'KYC verified' },
  { email: 'ananya@example.com', name: 'Ananya Gupta', role: 'Customer', note: 'KYC pending' },
  { email: 'teller@arthabank.test', name: 'Rohan Das', role: 'Teller', note: 'Maker' },
  { email: 'manager@arthabank.test', name: 'Kavya Iyer', role: 'Manager', note: 'Checker' },
  { email: 'admin@arthabank.test', name: 'Aarav Mehta', role: 'Admin', note: 'Full access' },
];

interface DemoAccountsProps {
  onPick: (email: string, password: string) => void;
}

/** Demo shortcuts for local runs and interview demos (hidden with VITE_SHOW_DEMO_ACCOUNTS=false). */
export function DemoAccounts({ onPick }: DemoAccountsProps) {
  return (
    <Accordion className="mt-4">
      <Accordion.Item eventKey="demo">
        <Accordion.Header>
          <span className="small fw-semibold">
            <i className="bi bi-person-badge me-2" aria-hidden="true" />
            Demo accounts
          </span>
        </Accordion.Header>
        <Accordion.Body className="p-2">
          <p className="small text-body-secondary px-2 mb-2">
            Pick an account to fill in the form. Every demo account uses the same password.
          </p>
          <div className="list-group list-group-flush">
            {accounts.map((account) => (
              <button
                key={account.email}
                type="button"
                className="list-group-item list-group-item-action d-flex align-items-center gap-2 rounded"
                onClick={() => onPick(account.email, DEMO_PASSWORD)}
              >
                <div className="min-w-0 flex-grow-1">
                  <div className="fw-medium small">{account.name}</div>
                  <div className="small text-body-secondary text-truncate">{account.email}</div>
                </div>
                <Badge bg="primary-subtle" text="primary-emphasis" className="rounded-pill">
                  {account.role}
                </Badge>
                <span className="small text-body-secondary d-none d-sm-inline">{account.note}</span>
              </button>
            ))}
          </div>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}
