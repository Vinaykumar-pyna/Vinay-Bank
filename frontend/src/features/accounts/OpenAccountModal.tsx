import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { useGetBranchesQuery, useRequestAccountMutation } from '@/features/banking/bankingApi';
import type { AccountType } from '@/features/banking/types';
import { errorMessage } from '@/lib/apiError';

const PRODUCTS: { type: AccountType; title: string; text: string; icon: string }[] = [
  {
    type: 'SAVINGS',
    title: 'Savings account',
    text: '3.00% p.a. interest, zero balance, free NEFT and RTGS.',
    icon: 'bi-piggy-bank',
  },
  {
    type: 'CURRENT',
    title: 'Current account',
    text: 'For business and freelance income, higher daily limits.',
    icon: 'bi-briefcase',
  },
];

export function OpenAccountModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const [type, setType] = useState<AccountType>('SAVINGS');
  const [nickname, setNickname] = useState('');
  const [branchCode, setBranchCode] = useState('0001');
  const { data: branches } = useGetBranchesQuery();
  const [requestAccount, { isLoading, error, reset }] = useRequestAccountMutation();

  const submit = async () => {
    try {
      await requestAccount({ type, nickname: nickname.trim() || undefined, branchCode }).unwrap();
      toast.success('Request sent. Your branch will review it shortly.');
      setNickname('');
      onHide();
    } catch {
      // shown inline
    }
  };

  return (
    <Modal
      show={show}
      onHide={() => {
        reset();
        onHide();
      }}
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          Open a new account
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" className="py-2">
            {errorMessage(error)}
          </Alert>
        )}
        <div className="d-grid gap-2 mb-3" role="radiogroup" aria-label="Account type">
          {PRODUCTS.map((p) => (
            <button
              key={p.type}
              type="button"
              role="radio"
              aria-checked={type === p.type}
              className={`choice-card d-flex gap-3 align-items-start ${type === p.type ? 'selected' : ''}`}
              onClick={() => setType(p.type)}
            >
              <span className="icon-tile icon-tile-primary">
                <i className={`bi ${p.icon}`} aria-hidden="true" />
              </span>
              <span>
                <span className="d-block fw-semibold">{p.title}</span>
                <span className="small text-body-secondary">{p.text}</span>
              </span>
            </button>
          ))}
        </div>
        <Form.Group className="mb-3" controlId="open-nickname">
          <Form.Label>Nickname (optional)</Form.Label>
          <Form.Control
            value={nickname}
            maxLength={40}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Travel fund"
          />
        </Form.Group>
        <Form.Group controlId="open-branch">
          <Form.Label>Home branch</Form.Label>
          <Form.Select value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
            {branches?.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name} ({b.ifsc})
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <p className="small text-body-secondary mt-3 mb-0">
          <i className="bi bi-info-circle me-1" aria-hidden="true" />
          New accounts are opened after a branch manager approves the request (maker-checker).
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isLoading}>
          {isLoading ? <Spinner size="sm" animation="border" /> : 'Submit request'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
