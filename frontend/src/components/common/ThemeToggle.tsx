import { Button } from 'react-bootstrap';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { toggleTheme } from '@/app/uiSlice';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useAppSelector((state) => state.ui.theme);
  const dispatch = useAppDispatch();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <Button
      variant="link"
      className={`text-body-secondary p-2 lh-1 ${className}`}
      onClick={() => dispatch(toggleTheme())}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <i
        className={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'} fs-5`}
        aria-hidden="true"
      />
    </Button>
  );
}
