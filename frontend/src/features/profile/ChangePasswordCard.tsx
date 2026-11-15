import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Form, Spinner } from 'react-bootstrap';
import { useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useChangePasswordMutation } from '@/features/auth/authApi';
import { PasswordStrengthMeter } from '@/features/auth/PasswordStrengthMeter';
import { errorMessage } from '@/lib/apiError';
import { passwordSchema } from '@/lib/validation';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Re-enter the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type Values = z.infer<typeof schema>;

export function ChangePasswordCard() {
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const newPassword = useWatch({ control, name: 'newPassword' });

  const onSubmit = async (values: Values) => {
    try {
      const result = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap();
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(
        result.otherSessionsSignedOut > 0
          ? `Password changed. ${result.otherSessionsSignedOut} other device(s) were signed out.`
          : 'Password changed successfully',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <Card.Body>
        <h2 className="h6 mb-1">Change password</h2>
        <p className="small text-body-secondary">
          Changing your password signs you out on every other device.
        </p>
        <Form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Form.Group className="mb-3" controlId="cp-current">
            <Form.Label>Current password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              isInvalid={!!errors.currentPassword}
              {...register('currentPassword')}
            />
            <Form.Control.Feedback type="invalid">
              {errors.currentPassword?.message}
            </Form.Control.Feedback>
          </Form.Group>
          <Form.Group className="mb-3" controlId="cp-new">
            <Form.Label>New password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="new-password"
              isInvalid={!!errors.newPassword}
              {...register('newPassword')}
            />
            <Form.Control.Feedback type="invalid">
              {errors.newPassword?.message}
            </Form.Control.Feedback>
            <PasswordStrengthMeter password={newPassword ?? ''} />
          </Form.Group>
          <Form.Group className="mb-3" controlId="cp-confirm">
            <Form.Label>Confirm new password</Form.Label>
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
          <Button type="submit" disabled={isLoading}>
            {isLoading ? <Spinner size="sm" animation="border" /> : 'Update password'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
}
