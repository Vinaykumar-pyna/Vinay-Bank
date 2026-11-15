import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useAddBeneficiaryMutation, useLookupIfscQuery } from '@/features/banking/bankingApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage, fieldErrors, toApiError } from '@/lib/apiError';
import { IFSC_REGEX } from '@/lib/validation';

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Enter the account holder name')
      .max(60)
      .regex(/^[A-Za-z][A-Za-z .&'-]*$/, 'Use letters only'),
    nickname: z.string().trim().max(30).optional(),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, 'Account numbers have 9 to 18 digits'),
    confirmAccountNumber: z.string().trim(),
    ifsc: z.string().trim().toUpperCase().regex(IFSC_REGEX, 'Enter a valid 11-character IFSC'),
  })
  .refine((v) => v.accountNumber === v.confirmAccountNumber, {
    path: ['confirmAccountNumber'],
    message: 'Account numbers do not match',
  });
type Values = z.input<typeof schema>;

export function AddBeneficiaryModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const [addBeneficiary, { isLoading }] = useAddBeneficiaryMutation();
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { ifsc: '' } });

  const ifsc = (useWatch({ control, name: 'ifsc' }) ?? '').trim().toUpperCase();
  const debouncedIfsc = useDebouncedValue(ifsc, 400);
  const lookup = useLookupIfscQuery(debouncedIfsc, { skip: !IFSC_REGEX.test(debouncedIfsc) });

  const close = () => {
    reset({ name: '', nickname: '', accountNumber: '', confirmAccountNumber: '', ifsc: '' });
    onHide();
  };

  const onSubmit = async (values: Values) => {
    try {
      const added = await addBeneficiary({
        name: values.name.trim(),
        nickname: values.nickname?.trim() || undefined,
        accountNumber: values.accountNumber.trim(),
        confirmAccountNumber: values.confirmAccountNumber.trim(),
        ifsc: values.ifsc.trim().toUpperCase(),
      }).unwrap();
      toast.success(`${added.name} added to your payees`);
      close();
    } catch (err) {
      const apiError = toApiError(err);
      const byField = fieldErrors(apiError);
      if (Object.keys(byField).length) {
        Object.entries(byField).forEach(([field, message]) =>
          setError(field as FieldPath<Values>, { message }),
        );
      } else {
        toast.error(apiError.message);
      }
    }
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            Add a payee
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-3">
          <Form.Group controlId="ben-ifsc">
            <Form.Label>IFSC code</Form.Label>
            <Form.Control
              placeholder="e.g. HDFC0000240 or ARTH0000003"
              maxLength={11}
              style={{ textTransform: 'uppercase' }}
              isInvalid={!!errors.ifsc || lookup.isError}
              {...register('ifsc')}
            />
            <Form.Control.Feedback type="invalid">
              {errors.ifsc?.message ?? (lookup.isError ? errorMessage(lookup.error) : '')}
            </Form.Control.Feedback>
            {lookup.isFetching && (
              <div className="small text-body-secondary mt-1">
                <Spinner size="sm" animation="border" className="me-1" /> Looking up branch...
              </div>
            )}
            {lookup.data && !lookup.isFetching && IFSC_REGEX.test(ifsc) && (
              <Alert variant="success" className="small py-2 mt-2 mb-0 d-flex gap-2">
                <i className="bi bi-bank mt-1" aria-hidden="true" />
                <div>
                  <div className="fw-semibold">{lookup.data.bank}</div>
                  <div>
                    {lookup.data.branch}
                    {lookup.data.city ? `, ${lookup.data.city}` : ''}
                  </div>
                  <div className="text-body-secondary">
                    {(['imps', 'neft', 'rtgs'] as const)
                      .filter((r) => lookup.data!.rails[r])
                      .map((r) => r.toUpperCase())
                      .join(' · ')}
                    {lookup.data.source === 'OFFLINE' &&
                      ' · branch directory offline, bank verified from code'}
                  </div>
                </div>
              </Alert>
            )}
          </Form.Group>
          <Form.Group controlId="ben-name">
            <Form.Label>Account holder name</Form.Label>
            <Form.Control autoComplete="off" isInvalid={!!errors.name} {...register('name')} />
            <Form.Control.Feedback type="invalid">{errors.name?.message}</Form.Control.Feedback>
          </Form.Group>
          <Form.Group controlId="ben-account">
            <Form.Label>Account number</Form.Label>
            <Form.Control
              inputMode="numeric"
              autoComplete="off"
              isInvalid={!!errors.accountNumber}
              {...register('accountNumber')}
            />
            <Form.Control.Feedback type="invalid">
              {errors.accountNumber?.message}
            </Form.Control.Feedback>
          </Form.Group>
          <Form.Group controlId="ben-confirm">
            <Form.Label>Re-enter account number</Form.Label>
            <Form.Control
              inputMode="numeric"
              autoComplete="off"
              isInvalid={!!errors.confirmAccountNumber}
              {...register('confirmAccountNumber')}
            />
            <Form.Control.Feedback type="invalid">
              {errors.confirmAccountNumber?.message}
            </Form.Control.Feedback>
          </Form.Group>
          <Form.Group controlId="ben-nickname">
            <Form.Label>
              Nickname <span className="text-body-secondary">(optional)</span>
            </Form.Label>
            <Form.Control
              placeholder="e.g. Landlord"
              isInvalid={!!errors.nickname}
              {...register('nickname')}
            />
          </Form.Group>
          <p className="small text-body-secondary mb-0">
            <i className="bi bi-shield-check me-1" aria-hidden="true" />
            For your safety, transfers to a new payee are capped at ₹50,000 for the first 24 hours.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? <Spinner size="sm" animation="border" /> : 'Add payee'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
