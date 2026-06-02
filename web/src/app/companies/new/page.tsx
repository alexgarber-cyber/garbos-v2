import { CompanyForm } from "@/components/CompanyForm";
import { PageHeader } from "@/components/ui";

export default function NewCompanyPage() {
  return (
    <div>
      <PageHeader title="New company" />
      <CompanyForm />
    </div>
  );
}
