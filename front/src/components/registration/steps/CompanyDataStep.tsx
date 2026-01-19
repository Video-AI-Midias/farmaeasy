/**
 * Step 3: Company Data - CNPJ, store type, business model, units count, ERP
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type RegistrationStep3Data,
  applyCNPJMask,
  businessModelOptions,
  registrationStep3Schema,
  storeTypeOptions,
} from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

interface CompanyDataStepProps {
  defaultValues?: Partial<RegistrationStep3Data>;
  onNext: (data: RegistrationStep3Data) => void;
  onBack: () => void;
}

export function CompanyDataStep({ defaultValues, onNext, onBack }: CompanyDataStepProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registrationStep3Schema),
    defaultValues: {
      cnpj: defaultValues?.cnpj ?? "",
      storeType: defaultValues?.storeType ?? ("" as "associada" | "independente"),
      businessModel:
        defaultValues?.businessModel ?? ("" as "farmacia" | "manipulacao" | "ecommerce"),
      unitsCount: defaultValues?.unitsCount ?? 1,
      erpSystem: defaultValues?.erpSystem ?? "",
    },
  });

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyCNPJMask(e.target.value);
    setValue("cnpj", masked, { shouldValidate: true });
  };

  return (
    <form
      onSubmit={handleSubmit((data) => {
        onNext(data as RegistrationStep3Data);
      })}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* CNPJ */}
        <div className="space-y-2">
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input
            id="cnpj"
            type="text"
            placeholder="00.000.000/0000-00"
            autoComplete="off"
            {...register("cnpj", { onChange: handleCnpjChange })}
          />
          {errors.cnpj && <p className="text-sm text-destructive">{errors.cnpj.message}</p>}
        </div>

        {/* Store Type */}
        <div className="space-y-3">
          <Label>Tipo de Loja</Label>
          <Controller
            name="storeType"
            control={control}
            render={({ field }) => (
              <RadioGroup
                onValueChange={field.onChange}
                defaultValue={field.value}
                className="flex flex-col gap-2"
              >
                {storeTypeOptions.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={option.value} id={`storeType-${option.value}`} />
                    <Label
                      htmlFor={`storeType-${option.value}`}
                      className="cursor-pointer font-normal"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          {errors.storeType && (
            <p className="text-sm text-destructive">{errors.storeType.message}</p>
          )}
        </div>

        {/* Business Model */}
        <div className="space-y-2">
          <Label>Modelo de Negócio</Label>
          <Controller
            name="businessModel"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {businessModelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.businessModel && (
            <p className="text-sm text-destructive">{errors.businessModel.message}</p>
          )}
        </div>

        {/* Units Count */}
        <div className="space-y-2">
          <Label htmlFor="unitsCount">Quantidade de Unidades</Label>
          <Input
            id="unitsCount"
            type="number"
            min={1}
            max={10000}
            placeholder="1"
            {...register("unitsCount")}
          />
          {errors.unitsCount && (
            <p className="text-sm text-destructive">{errors.unitsCount.message}</p>
          )}
        </div>

        {/* ERP System */}
        <div className="space-y-2">
          <Label htmlFor="erpSystem">Sistema ERP</Label>
          <Input
            id="erpSystem"
            type="text"
            placeholder="Nome do sistema utilizado"
            {...register("erpSystem")}
          />
          {errors.erpSystem && (
            <p className="text-sm text-destructive">{errors.erpSystem.message}</p>
          )}
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
