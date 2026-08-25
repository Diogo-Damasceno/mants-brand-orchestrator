import RegisterForm from '@/components/RegisterForm';
import { CommercialNotice } from '@/components/marketing';

export default function CadastroPage() {
  return (
    <div className="mx-auto max-w-md px-4">
      <RegisterForm />
      <div className="mx-auto mt-6 max-w-sm">
        <CommercialNotice variant="both" />
      </div>
    </div>
  );
}
