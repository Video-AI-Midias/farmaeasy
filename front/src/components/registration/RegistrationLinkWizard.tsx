/**
 * Multi-step wizard for registration link flow.
 * 5 steps: Access Data, Responsible Data, Company Data, Address, Digital Presence
 *
 * Features:
 * - Auto-saves progress to localStorage (except passwords)
 * - Warns user before leaving with unsaved data
 * - Restores progress on page reload
 */
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useBeforeUnload, useFormPersistence } from "@/hooks/useFormPersistence";
import type {
  RegistrationLinkFormData,
  RegistrationStep1Data,
  RegistrationStep2Data,
  RegistrationStep3Data,
  RegistrationStep4Data,
  RegistrationStep5Data,
} from "@/lib/validators";
import type { CoursePreview } from "@/types/registration-link";
import { RefreshCw, X } from "lucide-react";
import { useCallback, useState } from "react";
import { CourseAccessPreview } from "./CourseAccessPreview";
import { AccessDataStep } from "./steps/AccessDataStep";
import { AddressStep } from "./steps/AddressStep";
import { CompanyDataStep } from "./steps/CompanyDataStep";
import { DigitalPresenceStep } from "./steps/DigitalPresenceStep";
import { ResponsibleDataStep } from "./steps/ResponsibleDataStep";

/**
 * Remove undefined values from object (for exactOptionalPropertyTypes compatibility)
 */
function filterDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

interface RegistrationLinkWizardProps {
  courses: CoursePreview[];
  prefillPhone?: string;
  /** Unique key for localStorage persistence (e.g., shortcode) */
  persistenceKey?: string;
  onComplete: (data: RegistrationLinkFormData) => void | Promise<void>;
  isSubmitting?: boolean;
}

const STEP_TITLES = [
  "Dados de Acesso",
  "Dados do Responsável",
  "Dados da Empresa",
  "Endereço Comercial",
  "Presença Digital",
];

export function RegistrationLinkWizard({
  courses,
  prefillPhone,
  persistenceKey = "default",
  onComplete,
  isSubmitting = false,
}: RegistrationLinkWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showRestoredAlert, setShowRestoredAlert] = useState(false);

  // Persist form data to localStorage (except passwords)
  const {
    data: formData,
    setData: setFormData,
    clearPersistence,
    wasRestored,
  } = useFormPersistence<Partial<RegistrationLinkFormData>>({
    key: `registration_${persistenceKey}`,
    initialData: {},
    onRestore: () => setShowRestoredAlert(true),
  });

  // Warn user before leaving with unsaved data
  const hasUnsavedData = currentStep > 0 || Object.keys(formData).length > 0;
  useBeforeUnload(
    hasUnsavedData && !isSubmitting,
    "Você tem um cadastro em andamento. Deseja sair?",
  );

  // Clear saved data and start fresh
  const handleClearData = useCallback(() => {
    clearPersistence();
    setShowRestoredAlert(false);
    window.location.reload();
  }, [clearPersistence]);

  const progress = ((currentStep + 1) / STEP_TITLES.length) * 100;

  const handleStep1 = (data: RegistrationStep1Data) => {
    setFormData((prev) => ({
      ...prev,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
      whatsapp: data.whatsapp,
    }));
    setCurrentStep(1);
  };

  const handleStep2 = (data: RegistrationStep2Data) => {
    setFormData((prev) => ({
      ...prev,
      fullName: data.fullName,
      birthDate: data.birthDate,
      cpf: data.cpf,
    }));
    setCurrentStep(2);
  };

  const handleStep3 = (data: RegistrationStep3Data) => {
    setFormData((prev) => ({
      ...prev,
      cnpj: data.cnpj,
      storeType: data.storeType,
      businessModel: data.businessModel,
      unitsCount: data.unitsCount,
      erpSystem: data.erpSystem,
    }));
    setCurrentStep(3);
  };

  const handleStep4 = (data: RegistrationStep4Data) => {
    setFormData((prev) => {
      const newData: Partial<RegistrationLinkFormData> = {
        ...prev,
        zipCode: data.zipCode,
        state: data.state,
        city: data.city,
        neighborhood: data.neighborhood,
        street: data.street,
        number: data.number,
      };
      if (data.complement) {
        newData.complement = data.complement;
      }
      return newData;
    });
    setCurrentStep(4);
  };

  const handleStep5 = (data: RegistrationStep5Data) => {
    const completeData: RegistrationLinkFormData = {
      ...formData,
      instagram: data.instagram,
      monthlyRevenue: data.monthlyRevenue,
    } as RegistrationLinkFormData;

    // Clear persistence before submission
    clearPersistence();
    onComplete(completeData);
  };

  const goBack = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="space-y-6">
      {/* Restored Data Alert */}
      {showRestoredAlert && wasRestored && (
        <Alert className="border-primary/50 bg-primary/5">
          <RefreshCw className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Dados do cadastro anterior foram recuperados.</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={handleClearData}
              aria-label="Limpar dados salvos"
            >
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            Passo {currentStep + 1} de {STEP_TITLES.length}
          </span>
          <span className="text-muted-foreground">{STEP_TITLES[currentStep]}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Course Preview */}
      {courses.length > 0 && currentStep === 0 && <CourseAccessPreview courses={courses} />}

      {/* Steps */}
      {currentStep === 0 && (
        <AccessDataStep
          defaultValues={filterDefined({
            email: formData.email,
            password: formData.password,
            confirmPassword: formData.confirmPassword,
            whatsapp: formData.whatsapp,
          })}
          {...(prefillPhone ? { prefillPhone } : {})}
          onNext={handleStep1}
        />
      )}

      {currentStep === 1 && (
        <ResponsibleDataStep
          defaultValues={filterDefined({
            fullName: formData.fullName,
            birthDate: formData.birthDate,
            cpf: formData.cpf,
          })}
          onNext={handleStep2}
          onBack={goBack}
        />
      )}

      {currentStep === 2 && (
        <CompanyDataStep
          defaultValues={filterDefined({
            cnpj: formData.cnpj,
            storeType: formData.storeType,
            businessModel: formData.businessModel,
            unitsCount: formData.unitsCount,
            erpSystem: formData.erpSystem,
          })}
          onNext={handleStep3}
          onBack={goBack}
        />
      )}

      {currentStep === 3 && (
        <AddressStep
          defaultValues={filterDefined({
            zipCode: formData.zipCode,
            state: formData.state,
            city: formData.city,
            neighborhood: formData.neighborhood,
            street: formData.street,
            number: formData.number,
            complement: formData.complement,
          })}
          onNext={handleStep4}
          onBack={goBack}
        />
      )}

      {currentStep === 4 && (
        <DigitalPresenceStep
          defaultValues={filterDefined({
            instagram: formData.instagram,
            monthlyRevenue: formData.monthlyRevenue,
          })}
          onSubmit={handleStep5}
          onBack={goBack}
          isLoading={isSubmitting}
        />
      )}
    </div>
  );
}
