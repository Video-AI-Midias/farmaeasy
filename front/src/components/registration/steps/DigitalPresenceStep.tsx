/**
 * Step 5: Digital Presence - Instagram, monthly revenue
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type RegistrationStep5Data,
  monthlyRevenueOptions,
  registrationStep5Schema,
} from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { Instagram, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

interface DigitalPresenceStepProps {
  defaultValues?: Partial<RegistrationStep5Data>;
  onSubmit: (data: RegistrationStep5Data) => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function DigitalPresenceStep({
  defaultValues,
  onSubmit,
  onBack,
  isLoading = false,
}: DigitalPresenceStepProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registrationStep5Schema),
    defaultValues: {
      instagram: defaultValues?.instagram ?? "",
      monthlyRevenue:
        defaultValues?.monthlyRevenue ?? ("" as RegistrationStep5Data["monthlyRevenue"]),
    },
  });

  const handleInstagramChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove @ if user types it, we'll display it as prefix
    let value = e.target.value.replace(/^@/, "");
    // Remove spaces and special characters except underscore and period
    value = value.replace(/[^a-zA-Z0-9._]/g, "");
    setValue("instagram", value, { shouldValidate: true });
  };

  return (
    <form
      onSubmit={handleSubmit((data) => {
        onSubmit(data as RegistrationStep5Data);
      })}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* Instagram */}
        <div className="space-y-2">
          <Label htmlFor="instagram">Instagram da Farmácia</Label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Instagram className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">@</span>
            </div>
            <Input
              id="instagram"
              type="text"
              placeholder="suafarmacia"
              className="pl-14"
              {...register("instagram", { onChange: handleInstagramChange })}
            />
          </div>
          {errors.instagram && (
            <p className="text-sm text-destructive">{errors.instagram.message}</p>
          )}
          <p className="text-xs text-muted-foreground">Digite apenas o nome de usuário, sem o @</p>
        </div>

        {/* Monthly Revenue */}
        <div className="space-y-2">
          <Label>Faturamento Mensal Estimado</Label>
          <Controller
            name="monthlyRevenue"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a faixa de faturamento" />
                </SelectTrigger>
                <SelectContent>
                  {monthlyRevenueOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.monthlyRevenue && (
            <p className="text-sm text-destructive">{errors.monthlyRevenue.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Esta informação é confidencial e será usada apenas para personalizar sua experiência
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={isLoading}
        >
          Voltar
        </Button>
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finalizando...
            </>
          ) : (
            "Finalizar Cadastro"
          )}
        </Button>
      </div>
    </form>
  );
}
