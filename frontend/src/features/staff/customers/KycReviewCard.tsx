import { useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { UserProfile } from '@/features/auth/types';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime } from '@/lib/format';
import { useReviewKycMutation } from '../staffApi';

/**
 * KYC review. Managers and administrators verify or reject with remarks; the
 * customer is notified in real time and the decision is written to the audit trail.
 */
export function KycReviewCard({
  profile,
  canReview,
}: {
  profile: UserProfile;
  canReview: boolean;
}) {
  const [remarks, setRemarks] = useState('');
  const [review, { isLoading, error, originalArgs }] = useReviewKycMutation();
  const kyc = profile.kyc;
  const reviewable = canReview && kyc.status !== 'VERIFIED';
  const remarksValid = remarks.trim().length >= 3;

  const decide = async (decision: 'VERIFIED' | 'REJECTED') => {
    try {
      await review({ id: profile.id, decision, remarks: remarks.trim() }).unwrap();
      toast.success(
        decision === 'VERIFIED' ? 'KYC verified. The customer has been notified.' : 'KYC rejected',
      );
      setRemarks('');
    } catch {
      // Shown below.
    }
  };

  return (
    <Card>
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="card-title-sm mb-0">KYC</h2>
          <StatusBadge status={kyc.status} />
        </div>
        <div className="receipt-row">
          <span>PAN</span>
          <span className="font-mono">{kyc.panMasked ?? 'Not provided'}</span>
        </div>
        {kyc.reviewedAt && (
          <div className="receipt-row">
            <span>Reviewed</span>
            <span>{formatDateTime(kyc.reviewedAt)}</span>
          </div>
        )}
        {kyc.remarks && (
          <div className="receipt-row">
            <span>Remarks</span>
            <span className="text-break">{kyc.remarks}</span>
          </div>
        )}

        {reviewable ? (
          <div className="mt-3">
            {error && <Alert variant="danger">{errorMessage(error)}</Alert>}
            <Form.Group controlId="kyc-remarks" className="mb-2">
              <Form.Label className="small">Review remarks</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={300}
                value={remarks}
                placeholder="For example: PAN and Aadhaar verified against originals"
                onChange={(e) => setRemarks(e.target.value)}
              />
              <Form.Text>Required. The customer sees these remarks if KYC is rejected.</Form.Text>
            </Form.Group>
            <div className="d-flex gap-2 justify-content-end">
              <Button
                variant="outline-danger"
                size="sm"
                disabled={!remarksValid || isLoading}
                onClick={() => decide('REJECTED')}
              >
                {isLoading && originalArgs?.decision === 'REJECTED' && (
                  <Spinner size="sm" className="me-2" />
                )}
                Reject
              </Button>
              <Button
                variant="success"
                size="sm"
                disabled={!remarksValid || isLoading}
                onClick={() => decide('VERIFIED')}
              >
                {isLoading && originalArgs?.decision === 'VERIFIED' && (
                  <Spinner size="sm" className="me-2" />
                )}
                Verify KYC
              </Button>
            </div>
          </div>
        ) : (
          !canReview &&
          kyc.status !== 'VERIFIED' && (
            <p className="small text-body-secondary mt-3 mb-0">
              A branch manager reviews KYC documents. Ask the customer to bring original PAN and
              address proof.
            </p>
          )
        )}
      </Card.Body>
    </Card>
  );
}
