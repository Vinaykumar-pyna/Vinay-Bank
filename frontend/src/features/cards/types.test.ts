import { isWeakPin } from './types';

describe('isWeakPin', () => {
  it.each(['0000', '1111', '1234', '6789', '9876', '3210'])('refuses %s', (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });

  it.each(['4826', '1357', '2580', '9182'])('accepts %s', (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });
});
