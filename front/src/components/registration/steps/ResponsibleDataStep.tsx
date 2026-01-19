/**
 * Step 2: Responsible Data - Full name, birth date, CPF
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type RegistrationStep2Data,
  applyCPFMask,
  registrationStep2Schema,
} from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

interface ResponsibleDataStepProps {
  defaultValues?: Partial<RegistrationStep2Data>;
  onNext: (data: RegistrationStep2Data) => void;
  onBack: () => void;
}

export function ResponsibleDataStep({ defaultValues, onNext, onBack }: ResponsibleDataStepProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registrationStep2Schema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? "",
      birthDate: defaultValues?.birthDate ?? "",
      cpf: defaultValues?.cpf ?? "",
    },
  });

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyCPFMask(e.target.value);
    setValue("cpf", masked, { shouldValidate: true });
  };

  return (
    <form
      onSubmit={handleSubmit((data) => {
        onNext(data as RegistrationStep2Data);
      })}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName">Nome Completo</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Nome completo do responsável"
            autoComplete="name"
            {...register("fullName")}
          />
          {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
        </div>

        {/* Birth Date */}
        <div className="space-y-2">
          <Label htmlFor="birthDate">Data de Nascimento</Label>
          <Input id="birthDate" type="date" autoComplete="bday" {...register("birthDate")} />
          {errors.birthDate && (
            <p className="text-sm text-destructive">{errors.birthDate.message}</p>
          )}
        </div>

        {/* CPF */}
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            type="text"
            placeholder="000.000.000-00"
            autoComplete="off"
            {...register("cpf", { onChange: handleCpfChange })}
          />
          {errors.cpf && <p className="text-sm text-destructive">{errors.cpf.message}</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          Próximo
        </Button>
      </div>
    </form>
  );
}
