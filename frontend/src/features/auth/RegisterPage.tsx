import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type MouseEvent } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { z } from 'zod';
import { fieldErrors, toApiError, type ApiError } from '@/lib/apiError';
import {
  emailSchema,
  INDIAN_STATES,
  isAdult,
  MOBILE_REGEX,
  NAME_REGEX,
  PAN_REGEX,
  passwordSchema,
  PINCODE_REGEX,
} from '@/lib/validation';
import { useRegisterMutation } from './authApi';
import { AuthLayout } from './AuthLayout';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

const schema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, 'Enter your first name')
      .max(50)
      .regex(NAME_REGEX, 'Use letters only'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Enter your last name')
      .max(50)
      .regex(NAME_REGEX, 'Use letters only'),
    dateOfBirth: z
      .string()
      .min(1, 'Enter your date of birth')
      .refine((value) => isAdult(value), 'You must be at least 18 years old'),
    pan: z.string().trim().regex(PAN_REGEX, 'Enter a valid PAN, for example ABCPE1234F'),
    email: emailSchema,
    phone: z.string().trim().regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number'),
    address: z.object({
      line1: z.string().trim().min(3, 'Enter your house and street').max(120),
      line2: z.string().trim().max(120).optional(),
      city: z.string().trim().min(2, 'Enter your city').max(60),
      state: z.string().min(2, 'Select your state'),
      pincode: z.string().trim().regex(PINCODE_REGEX, 'Enter a valid 6-digit PIN code'),
    }),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Re-enter your password'),
    acceptTerms: z.boolean().refine((value) => value, 'Please accept the terms and conditions'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type RegisterValues = z.infer<typeof schema>;

const STEPS: { title: string; icon: string; fields: FieldPath<RegisterValues>[] }[] = [
  {
    title: 'Personal details',
    icon: 'bi-person',
    fields: ['firstName', 'lastName', 'dateOfBirth', 'pan'],
  },
  {
    title: 'Contact and address',
    icon: 'bi-geo-alt',
    fields: [
      'email',
      'phone',
      'address.line1',
      'address.line2',
      'address.city',
      'address.state',
      'address.pincode',
    ],
  },
  {
    title: 'Secure your account',
    icon: 'bi-shield-lock',
    fields: ['password', 'confirmPassword', 'acceptTerms'],
  },
];

function stepOf(field: string): number {
  const index = STEPS.findIndex((step) =>
    step.fields.some((f) => f === field || field.startsWith(`${f}.`)),
  );
  return index === -1 ? 0 : index;
}

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [registerCustomer, { isLoading }] = useRegisterMutation();
  const {
    register,
    handleSubmit,
    trigger,
    control,
    getFieldState,
    setError,
    formState: { errors, submitCount },
  } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      pan: '',
      email: '',
      phone: '',
      address: { line1: '', line2: '', city: '', state: '', pincode: '' },
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  // The terms message belongs to a submit attempt: it appears when "Create my
  // account" is pressed with the box clear and goes as soon as the box is
  // ticked. Clearing the box again does not bring it back before the next attempt.
  const [termsChangedAt, setTermsChangedAt] = useState(0);
  const termsError = submitCount > termsChangedAt ? errors.acceptTerms?.message : undefined;

  const next = async (event: MouseEvent<HTMLButtonElement>) => {
    // React turns this same button into "Create my account" on the last step, and
    // a browser carries out a click's default action only after its handlers have
    // run, when the button already submits. Without this, the click that opens
    // the last step would also submit the form and show every error there before
    // anything was typed.
    event.preventDefault();
    if (await trigger(STEPS[step].fields)) setStep((s) => s + 1);
  };

  const onSubmit = async ({ confirmPassword: _confirm, ...values }: RegisterValues) => {
    setApiError(null);
    try {
      const session = await registerCustomer({
        ...values,
        pan: values.pan.toUpperCase(),
        address: { ...values.address, line2: values.address.line2 || undefined },
      }).unwrap();
      toast.success(`Welcome to Vinay Bank, ${session.user.firstName}! Your profile is ready.`);
    } catch (err) {
      const error = toApiError(err);
      setApiError(error);
      const byField = fieldErrors(error);
      const fields = Object.keys(byField);
      fields.forEach((field) =>
        setError(field as FieldPath<RegisterValues>, { type: 'server', message: byField[field] }),
      );
      if (fields.length) setStep(stepOf(fields[0]));
      else if (/PAN/i.test(error.message)) setStep(0);
      else if (/email|mobile/i.test(error.message)) setStep(1);
    }
  };

  const password = useWatch({ control, name: 'password' });

  return (
    <AuthLayout>
      <h1 className="h3 mb-1">Open your account</h1>
      <p className="text-body-secondary mb-4">It takes about two minutes. Keep your PAN handy.</p>

      <ol className="d-flex gap-2 list-unstyled mb-4" aria-label="Registration progress">
        {STEPS.map((s, index) => (
          <li key={s.title} className="flex-fill">
            <div
              className={`rounded-pill ${index <= step ? 'bg-primary' : 'bg-body-secondary'}`}
              style={{ height: 6 }}
            />
            <div className={`small mt-1 ${index === step ? 'fw-semibold' : 'text-body-secondary'}`}>
              <span className="d-none d-sm-inline">{s.title}</span>
              <span className="d-sm-none">Step {index + 1}</span>
            </div>
          </li>
        ))}
      </ol>

      {apiError && apiError.code !== 'VALIDATION_FAILED' && (
        <Alert variant="danger" className="py-2">
          {apiError.message}
        </Alert>
      )}

      <Form onSubmit={handleSubmit(onSubmit)} noValidate>
        {step === 0 && (
          <>
            <Row className="g-3">
              <Col sm={6}>
                <Form.Group controlId="reg-first">
                  <Form.Label>First name</Form.Label>
                  <Form.Control
                    autoComplete="given-name"
                    isInvalid={!!errors.firstName}
                    {...register('firstName')}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.firstName?.message}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="reg-last">
                  <Form.Label>Last name</Form.Label>
                  <Form.Control
                    autoComplete="family-name"
                    isInvalid={!!errors.lastName}
                    {...register('lastName')}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.lastName?.message}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="reg-dob">
                  <Form.Label>Date of birth</Form.Label>
                  <Form.Control
                    type="date"
                    autoComplete="bday"
                    isInvalid={!!errors.dateOfBirth}
                    {...register('dateOfBirth')}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.dateOfBirth?.message}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col sm={6}>
                <Form.Group controlId="reg-pan">
                  <Form.Label>PAN</Form.Label>
                  <Form.Control
                    placeholder="ABCPE1234F"
                    maxLength={10}
                    style={{ textTransform: 'uppercase' }}
                    isInvalid={!!errors.pan}
                    {...register('pan', { setValueAs: (v: string) => v.toUpperCase().trim() })}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.pan?.message}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            <p className="small text-body-secondary mt-3 mb-0">
              <i className="bi bi-lock me-1" aria-hidden="true" />
              Your PAN is encrypted before it is stored. We only ever display the last four
              characters.
            </p>
          </>
        )}

        {step === 1 && (
          <Row className="g-3">
            <Col sm={7}>
              <Form.Group controlId="reg-email">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  autoComplete="email"
                  isInvalid={!!errors.email}
                  {...register('email')}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.email?.message}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col sm={5}>
              <Form.Group controlId="reg-phone">
                <Form.Label>Mobile number</Form.Label>
                <Form.Control
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  isInvalid={!!errors.phone}
                  {...register('phone')}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.phone?.message}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="reg-line1">
                <Form.Label>House and street</Form.Label>
                <Form.Control
                  autoComplete="address-line1"
                  isInvalid={!!errors.address?.line1}
                  {...register('address.line1')}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.address?.line1?.message}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col xs={12}>
              <Form.Group controlId="reg-line2">
                <Form.Label>
                  Area or landmark <span className="text-body-secondary">(optional)</span>
                </Form.Label>
                <Form.Control autoComplete="address-line2" {...register('address.line2')} />
              </Form.Group>
            </Col>
            <Col sm={5}>
              <Form.Group controlId="reg-city">
                <Form.Label>City</Form.Label>
                <Form.Control
                  autoComplete="address-level2"
                  isInvalid={!!errors.address?.city}
                  {...register('address.city')}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.address?.city?.message}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col sm={4}>
              <Form.Group controlId="reg-state">
                <Form.Label>State</Form.Label>
                <Form.Select isInvalid={!!errors.address?.state} {...register('address.state')}>
                  <option value="">Select</option>
                  {INDIAN_STATES.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {errors.address?.state?.message}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col sm={3}>
              <Form.Group controlId="reg-pincode">
                <Form.Label>PIN code</Form.Label>
                <Form.Control
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="postal-code"
                  isInvalid={!!errors.address?.pincode}
                  {...register('address.pincode')}
                />
                <Form.Control.Feedback type="invalid">
                  {errors.address?.pincode?.message}
                </Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>
        )}

        {step === 2 && (
          <>
            <Form.Group className="mb-3" controlId="reg-password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="new-password"
                isInvalid={!!errors.password}
                {...register('password', {
                  // Keep "Passwords do not match" in step with the password once the
                  // confirmation has been filled in and left (or after a submit attempt).
                  onChange: () => {
                    if (submitCount > 0 || getFieldState('confirmPassword').isTouched) {
                      void trigger('confirmPassword');
                    }
                  },
                })}
              />
              <Form.Control.Feedback type="invalid">
                {errors.password?.message}
              </Form.Control.Feedback>
              <PasswordStrengthMeter password={password} />
              <Form.Text>
                8 or more characters with upper and lower case letters, a number and a symbol.
              </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="reg-confirm">
              <Form.Label>Confirm password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="new-password"
                isInvalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              <Form.Control.Feedback type="invalid">
                {errors.confirmPassword?.message}
              </Form.Control.Feedback>
            </Form.Group>
            <Form.Group controlId="reg-terms">
              <Form.Check
                type="checkbox"
                isInvalid={!!termsError}
                feedback={termsError}
                feedbackType="invalid"
                label="I agree to the terms and conditions and the privacy policy"
                {...register('acceptTerms', { onChange: () => setTermsChangedAt(submitCount) })}
              />
            </Form.Group>
          </>
        )}

        <div className="d-flex gap-2 mt-4">
          {step > 0 && (
            <Button variant="outline-secondary" onClick={() => setStep((s) => s - 1)}>
              <i className="bi bi-arrow-left me-1" aria-hidden="true" />
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" className="ms-auto" onClick={next}>
              Continue <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" className="ms-auto" disabled={isLoading}>
              {isLoading ? <Spinner size="sm" animation="border" /> : 'Create my account'}
            </Button>
          )}
        </div>
      </Form>

      <p className="text-center text-body-secondary mt-4 mb-0">
        Already a customer? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
