/**
 * Step 4: Address - CEP, state, city, neighborhood, street, number, complement
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
  type RegistrationStep4Data,
  applyCEPMask,
  brazilianStates,
  normalizeCEP,
  registrationStep4Schema,
} from "@/lib/validators";
import type { ViaCEPResponse } from "@/types/registration-link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

/** Timeout for CEP API request in milliseconds */
const CEP_TIMEOUT_MS = 10000;

interface AddressStepProps {
  defaultValues?: Partial<RegistrationStep4Data>;
  onNext: (data: RegistrationStep4Data) => void;
  onBack: () => void;
}

export function AddressStep({ defaultValues, onNext, onBack }: AddressStepProps) {
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  // AbortController for canceling CEP requests
  const cepAbortControllerRef = useRef<AbortController | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registrationStep4Schema),
    defaultValues: {
      zipCode: defaultValues?.zipCode ?? "",
      state: defaultValues?.state ?? ("" as (typeof brazilianStates)[number]),
      city: defaultValues?.city ?? "",
      neighborhood: defaultValues?.neighborhood ?? "",
      street: defaultValues?.street ?? "",
      number: defaultValues?.number ?? "",
      complement: defaultValues?.complement ?? "",
    },
  });

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      cepAbortControllerRef.current?.abort();
    };
  }, []);

  const fetchAddressFromCep = async (cep: string) => {
    const normalizedCep = normalizeCEP(cep);
    if (normalizedCep.length !== 8) return;

    // Cancel any previous request
    cepAbortControllerRef.current?.abort();
    cepAbortControllerRef.current = new AbortController();

    setIsLoadingCep(true);
    setCepError(null);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalizedCep}/json/`, {
        signal: AbortSignal.any([
          cepAbortControllerRef.current.signal,
          AbortSignal.timeout(CEP_TIMEOUT_MS),
        ]),
      });
      const data: ViaCEPResponse = await response.json();

      if (data.erro) {
        setCepError("CEP não encontrado");
        return;
      }

      // Auto-fill address fields
      setValue("street", data.logradouro || "", { shouldValidate: true });
      setValue("neighborhood", data.bairro || "", { shouldValidate: true });
      setValue("city", data.localidade || "", { shouldValidate: true });

      // Map ViaCEP state abbreviation to our enum
      const stateValue = data.uf as (typeof brazilianStates)[number];
      if (brazilianStates.includes(stateValue)) {
        setValue("state", stateValue, { shouldValidate: true });
      }
    } catch (err) {
      // Ignore abort errors (user typed new CEP or component unmounted)
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      // Handle timeout
      if (err instanceof DOMException && err.name === "TimeoutError") {
        setCepError("Tempo esgotado ao buscar CEP. Tente novamente.");
        return;
      }
      setCepError("Erro ao buscar CEP");
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyCEPMask(e.target.value);
    setValue("zipCode", masked, { shouldValidate: true });

    // Auto-fetch when CEP is complete
    const digits = masked.replace(/\D/g, "");
    if (digits.length === 8) {
      fetchAddressFromCep(digits);
    }
  };

  return (
    <form
      onSubmit={handleSubmit((data) => {
        onNext(data as RegistrationStep4Data);
      })}
      className="space-y-6"
    >
      <div className="space-y-4">
        {/* CEP */}
        <div className="space-y-2">
          <Label htmlFor="zipCode">CEP</Label>
          <div className="relative">
            <Input
              id="zipCode"
              type="text"
              placeholder="00000-000"
              autoComplete="postal-code"
              {...register("zipCode", { onChange: handleCepChange })}
            />
            {isLoadingCep && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          {errors.zipCode && <p className="text-sm text-destructive">{errors.zipCode.message}</p>}
          {cepError && <p className="text-sm text-destructive">{cepError}</p>}
        </div>

        {/* State and City Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* State */}
          <div className="space-y-2">
            <Label>Estado</Label>
            <Controller
              name="state"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {brazilianStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.state && <p className="text-sm text-destructive">{errors.state.message}</p>}
          </div>

          {/* City */}
          <div className="space-y-2">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              type="text"
              placeholder="Cidade"
              autoComplete="address-level2"
              {...register("city")}
            />
            {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
          </div>
        </div>

        {/* Neighborhood */}
        <div className="space-y-2">
          <Label htmlFor="neighborhood">Bairro</Label>
          <Input
            id="neighborhood"
            type="text"
            placeholder="Bairro"
            autoComplete="address-level3"
            {...register("neighborhood")}
          />
          {errors.neighborhood && (
            <p className="text-sm text-destructive">{errors.neighborhood.message}</p>
          )}
        </div>

        {/* Street */}
        <div className="space-y-2">
          <Label htmlFor="street">Rua</Label>
          <Input
            id="street"
            type="text"
            placeholder="Rua, Avenida, etc."
            autoComplete="street-address"
            {...register("street")}
          />
          {errors.street && <p className="text-sm text-destructive">{errors.street.message}</p>}
        </div>

        {/* Number and Complement Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Number */}
          <div className="space-y-2">
            <Label htmlFor="number">Número</Label>
            <Input id="number" type="text" placeholder="123" {...register("number")} />
            {errors.number && <p className="text-sm text-destructive">{errors.number.message}</p>}
          </div>

          {/* Complement */}
          <div className="space-y-2">
            <Label htmlFor="complement">Complemento</Label>
            <Input
              id="complement"
              type="text"
              placeholder="Apto, Sala..."
              {...register("complement")}
            />
            {errors.complement && (
              <p className="text-sm text-destructive">{errors.complement.message}</p>
            )}
          </div>
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
