import { Form, InputGroup } from 'react-bootstrap';
import { amountInWords } from '@/lib/amountInWords';
import { rupeesToPaise } from '@/lib/format';

interface AmountInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  helper?: string;
}

/**
 * Rupee amount field. Accepts digits with up to two decimals and shows the
 * amount in words (Indian numbering), a common safeguard against typos.
 */
export function AmountInput({
  id,
  value,
  onChange,
  error,
  label = 'Amount',
  helper,
}: AmountInputProps) {
  const paise = rupeesToPaise(value);
  return (
    <Form.Group controlId={id}>
      <Form.Label>{label}</Form.Label>
      <InputGroup hasValidation size="lg">
        <InputGroup.Text>₹</InputGroup.Text>
        <Form.Control
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          isInvalid={!!error}
          onChange={(e) =>
            onChange(e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d{0,2}).*$/, '$1'))
          }
        />
        <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      </InputGroup>
      <Form.Text className="d-block">{paise ? amountInWords(paise) : helper}</Form.Text>
    </Form.Group>
  );
}
