import LoginForm from '@/components/LoginForm';
import { CommercialNotice } from '@/components/marketing';

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4">
      <LoginForm />
      <div className="mx-auto mt-6 max-w-sm">
        <CommercialNotice variant="both" />
      </div>
    </div>
  );
}
