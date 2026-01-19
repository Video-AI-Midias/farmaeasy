/**
 * Frontend validators for Brazilian CPF, phone, and password.
 * Mirrors backend validation logic from src/auth/validators.py
 */

// ==============================================================================
// Constants (matching backend)
// ==============================================================================

export const CPF_DIGIT_LENGTH = 11;
export const PHONE_DIGIT_LENGTH = 11;
export const DDD_MIN = 11;
export const DDD_MAX = 99;
export const PASSWORD_MIN_LENGTH = 8;

// ==============================================================================
// Validation Result
// ==============================================================================

export interface ValidationResult {
  valid: boolean;
  message?: string;
  formatted?: string;
}

// ==============================================================================
// CPF Validation
// ==============================================================================

/**
 * Validate a Brazilian CPF number.
 * CPF has 11 digits with 2 check digits calculated using modulo 11.
 */
export function validateCPF(cpf: string): ValidationResult {
  // Remove non-digits
  const cpfDigits = cpf.replace(/\D/g, "");

  // Must have exactly 11 digits
  if (cpfDigits.length !== CPF_DIGIT_LENGTH) {
    return { valid: false, message: "CPF deve ter 11 dígitos" };
  }

  // Reject known invalid patterns (all same digit)
  if (/^(\d)\1+$/.test(cpfDigits)) {
    return { valid: false, message: "CPF inválido" };
  }

  // Validate check digits
  for (let i = 9; i <= 10; i++) {
    let total = 0;
    for (let num = 0; num < i; num++) {
      total += Number.parseInt(cpfDigits[num] ?? "0", 10) * (i + 1 - num);
    }
    const digit = ((total * 10) % 11) % 10;
    if (digit !== Number.parseInt(cpfDigits[i] ?? "0", 10)) {
      return { valid: false, message: "CPF inválido" };
    }
  }

  // Format as XXX.XXX.XXX-XX
  const formatted = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
  return { valid: true, formatted };
}

/**
 * Remove formatting from CPF, keeping only digits.
 */
export function normalizeCPF(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/**
 * Format CPF as XXX.XXX.XXX-XX.
 */
export function formatCPF(cpf: string): string {
  const digits = normalizeCPF(cpf);
  if (digits.length !== CPF_DIGIT_LENGTH) {
    return cpf;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Apply CPF input mask (for onChange handlers).
 * Formats as user types: 123 -> 123.456 -> 123.456.789 -> 123.456.789-01
 */
export function applyCPFMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, CPF_DIGIT_LENGTH);
  let masked = digits;

  if (digits.length > 3) {
    masked = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }
  if (digits.length > 6) {
    masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  if (digits.length > 9) {
    masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  return masked;
}

// ==============================================================================
// Phone Validation
// ==============================================================================

/**
 * Validate a Brazilian mobile phone number.
 * Expected format: (XX) 9XXXX-XXXX
 * - 2 digits for DDD (area code, 11-99)
 * - 9 digits for number (must start with 9 for mobile)
 */
export function validatePhone(phone: string): ValidationResult {
  // Remove non-digits
  const phoneDigits = phone.replace(/\D/g, "");

  // Must have exactly 11 digits
  if (phoneDigits.length !== PHONE_DIGIT_LENGTH) {
    return { valid: false, message: "Telefone deve ter 11 dígitos" };
  }

  // Validate DDD (area code)
  const ddd = Number.parseInt(phoneDigits.slice(0, 2), 10);
  if (ddd < DDD_MIN || ddd > DDD_MAX) {
    return { valid: false, message: "DDD inválido" };
  }

  // Mobile numbers must start with 9
  if (phoneDigits[2] !== "9") {
    return { valid: false, message: "Número de celular deve começar com 9" };
  }

  // Format as (XX) 9XXXX-XXXX
  const formatted = `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, 7)}-${phoneDigits.slice(7)}`;
  return { valid: true, formatted };
}

/**
 * Remove formatting from phone, keeping only digits.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Format phone as (XX) 9XXXX-XXXX.
 */
export function formatPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length !== PHONE_DIGIT_LENGTH) {
    return phone;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Apply phone input mask (for onChange handlers).
 * Formats as user types: 11 -> (11) 9 -> (11) 98765 -> (11) 98765-4321
 */
export function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, PHONE_DIGIT_LENGTH);
  let masked = digits;

  if (digits.length > 0) {
    masked = `(${digits.slice(0, 2)}`;
  }
  if (digits.length > 2) {
    masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length > 7) {
    masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return masked;
}

// ==============================================================================
// Password Validation
// ==============================================================================

export interface PasswordStrength {
  score: number; // 0-4
  label: "fraca" | "razoável" | "boa" | "forte" | "muito forte";
  feedback: string[];
}

/**
 * Validate password strength.
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export function validatePassword(password: string): ValidationResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: "Senha deve ter no mínimo 8 caracteres" };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Senha deve ter pelo menos uma letra maiúscula" };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Senha deve ter pelo menos uma letra minúscula" };
  }

  if (!/\d/.test(password)) {
    return { valid: false, message: "Senha deve ter pelo menos um número" };
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: "Senha deve ter pelo menos um caractere especial" };
  }

  return { valid: true };
}

/**
 * Calculate password strength for visual feedback.
 */
export function getPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  // Length checks
  if (password.length >= PASSWORD_MIN_LENGTH) {
    score++;
  } else {
    feedback.push("Use pelo menos 8 caracteres");
  }

  if (password.length >= 12) {
    score++;
  }

  // Character type checks
  if (/[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push("Adicione uma letra maiúscula");
  }

  if (/[a-z]/.test(password)) {
    // Required but doesn't add score (baseline)
  } else {
    feedback.push("Adicione uma letra minúscula");
  }

  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push("Adicione um número");
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score++;
  } else {
    feedback.push("Adicione um caractere especial (!@#$%...)");
  }

  // Cap at 4
  const finalScore = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<0 | 1 | 2 | 3 | 4, PasswordStrength["label"]> = {
    0: "fraca",
    1: "razoável",
    2: "boa",
    3: "forte",
    4: "muito forte",
  };

  return {
    score: finalScore,
    label: labels[finalScore],
    feedback,
  };
}

// ==============================================================================
// Email Validation
// ==============================================================================

/**
 * Basic email format validation.
 * For full validation, use Zod's email validator.
 */
export function validateEmail(email: string): ValidationResult {
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailPattern.test(email)) {
    return { valid: true };
  }
  return { valid: false, message: "E-mail inválido" };
}

// ==============================================================================
// Zod Schemas (for React Hook Form integration)
// ==============================================================================

import { z } from "zod";

/**
 * CPF schema with custom validation
 */
export const cpfSchema = z
  .string()
  .min(1, "CPF é obrigatório")
  .superRefine((val, ctx) => {
    const result = validateCPF(val);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message ?? "CPF inválido",
      });
    }
  });

/**
 * Phone schema with custom validation
 */
export const phoneSchema = z
  .string()
  .min(1, "Telefone é obrigatório")
  .superRefine((val, ctx) => {
    const result = validatePhone(val);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message ?? "Telefone inválido",
      });
    }
  });

/**
 * Password schema with custom validation
 */
export const passwordSchema = z
  .string()
  .min(1, "Senha é obrigatória")
  .superRefine((val, ctx) => {
    const result = validatePassword(val);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message ?? "Senha inválida",
      });
    }
  });

/**
 * Login form schema
 */
export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Registration form schema
 */
export const registerSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: passwordSchema,
  confirmPassword: z.string(),
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  cpf: cpfSchema,
  phone: phoneSchema,
});

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Refined registration schema with password confirmation
 */
export const registerSchemaWithConfirm = registerSchema.refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  },
);

/**
 * Change password form schema
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Senha atual é obrigatória"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

/**
 * Profile update form schema
 */
export const profileSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo").optional(),
  phone: phoneSchema.optional().or(z.literal("")),
  avatar_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

// ==============================================================================
// CNPJ Validation (Brazilian Company ID)
// ==============================================================================

export const CNPJ_DIGIT_LENGTH = 14;

/**
 * Validate a Brazilian CNPJ number.
 * CNPJ has 14 digits with 2 check digits calculated using modulo 11.
 */
export function validateCNPJ(cnpj: string): ValidationResult {
  // Remove non-digits
  const cnpjDigits = cnpj.replace(/\D/g, "");

  // Must have exactly 14 digits
  if (cnpjDigits.length !== CNPJ_DIGIT_LENGTH) {
    return { valid: false, message: "CNPJ deve ter 14 dígitos" };
  }

  // Reject known invalid patterns (all same digit)
  if (/^(\d)\1+$/.test(cnpjDigits)) {
    return { valid: false, message: "CNPJ inválido" };
  }

  // Validate first check digit
  let size = cnpjDigits.length - 2;
  let numbers = cnpjDigits.substring(0, size);
  const digits = cnpjDigits.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += Number.parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number.parseInt(digits.charAt(0), 10)) {
    return { valid: false, message: "CNPJ inválido" };
  }

  // Validate second check digit
  size = size + 1;
  numbers = cnpjDigits.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += Number.parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number.parseInt(digits.charAt(1), 10)) {
    return { valid: false, message: "CNPJ inválido" };
  }

  // Format as XX.XXX.XXX/XXXX-XX
  const formatted = `${cnpjDigits.slice(0, 2)}.${cnpjDigits.slice(2, 5)}.${cnpjDigits.slice(5, 8)}/${cnpjDigits.slice(8, 12)}-${cnpjDigits.slice(12)}`;
  return { valid: true, formatted };
}

/**
 * Remove formatting from CNPJ, keeping only digits.
 */
export function normalizeCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/**
 * Format CNPJ as XX.XXX.XXX/XXXX-XX.
 */
export function formatCNPJ(cnpj: string): string {
  const digits = normalizeCNPJ(cnpj);
  if (digits.length !== CNPJ_DIGIT_LENGTH) {
    return cnpj;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Apply CNPJ input mask (for onChange handlers).
 */
export function applyCNPJMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, CNPJ_DIGIT_LENGTH);
  let masked = digits;

  if (digits.length > 2) {
    masked = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }
  if (digits.length > 5) {
    masked = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length > 8) {
    masked = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  if (digits.length > 12) {
    masked = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }

  return masked;
}

/**
 * CNPJ schema with custom validation
 */
export const cnpjSchema = z
  .string()
  .min(1, "CNPJ é obrigatório")
  .superRefine((val, ctx) => {
    const result = validateCNPJ(val);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message ?? "CNPJ inválido",
      });
    }
  });

// ==============================================================================
// CEP (Brazilian Postal Code) Validation
// ==============================================================================

export const CEP_DIGIT_LENGTH = 8;

/**
 * Validate a Brazilian CEP (postal code).
 * CEP has 8 digits in format XXXXX-XXX.
 */
export function validateCEP(cep: string): ValidationResult {
  const cepDigits = cep.replace(/\D/g, "");

  if (cepDigits.length !== CEP_DIGIT_LENGTH) {
    return { valid: false, message: "CEP deve ter 8 dígitos" };
  }

  // Format as XXXXX-XXX
  const formatted = `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`;
  return { valid: true, formatted };
}

/**
 * Remove formatting from CEP, keeping only digits.
 */
export function normalizeCEP(cep: string): string {
  return cep.replace(/\D/g, "");
}

/**
 * Format CEP as XXXXX-XXX.
 */
export function formatCEP(cep: string): string {
  const digits = normalizeCEP(cep);
  if (digits.length !== CEP_DIGIT_LENGTH) {
    return cep;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Apply CEP input mask (for onChange handlers).
 */
export function applyCEPMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, CEP_DIGIT_LENGTH);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

/**
 * CEP schema with custom validation
 */
export const cepSchema = z
  .string()
  .min(1, "CEP é obrigatório")
  .superRefine((val, ctx) => {
    const result = validateCEP(val);
    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message ?? "CEP inválido",
      });
    }
  });

// ==============================================================================
// Registration Link Form Types and Schemas
// ==============================================================================

/**
 * Store type enum
 */
export const storeTypeOptions = [
  { value: "associada", label: "Associada a uma rede" },
  { value: "independente", label: "Independente" },
] as const;

export type StoreType = (typeof storeTypeOptions)[number]["value"];

/**
 * Business model enum
 */
export const businessModelOptions = [
  { value: "farmacia", label: "Farmácia tradicional" },
  { value: "manipulacao", label: "Farmácia de manipulação" },
  { value: "ecommerce", label: "E-commerce" },
] as const;

export type BusinessModel = (typeof businessModelOptions)[number]["value"];

/**
 * Monthly revenue ranges
 */
export const monthlyRevenueOptions = [
  { value: "ate_30k", label: "Até R$ 30.000" },
  { value: "30k_50k", label: "R$ 30.000 - R$ 50.000" },
  { value: "50k_100k", label: "R$ 50.000 - R$ 100.000" },
  { value: "100k_200k", label: "R$ 100.000 - R$ 200.000" },
  { value: "200k_500k", label: "R$ 200.000 - R$ 500.000" },
  { value: "500k_1m", label: "R$ 500.000 - R$ 1.000.000" },
  { value: "acima_1m", label: "Acima de R$ 1.000.000" },
] as const;

export type MonthlyRevenue = (typeof monthlyRevenueOptions)[number]["value"];

/**
 * Brazilian states
 */
export const brazilianStates = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export type BrazilianState = (typeof brazilianStates)[number];

/**
 * Registration link form schema - Step 1 (Access Data)
 */
export const registrationStep1Schema = z
  .object({
    email: z.string().email("E-mail inválido"),
    password: passwordSchema,
    confirmPassword: z.string(),
    whatsapp: phoneSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export type RegistrationStep1Data = z.infer<typeof registrationStep1Schema>;

/**
 * Registration link form schema - Step 2 (Responsible Data)
 */
export const registrationStep2Schema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres").max(200, "Nome muito longo"),
  birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
  cpf: cpfSchema,
});

export type RegistrationStep2Data = z.infer<typeof registrationStep2Schema>;

/**
 * Registration link form schema - Step 3 (Company Data)
 */
export const registrationStep3Schema = z.object({
  cnpj: cnpjSchema,
  storeType: z.enum(["associada", "independente"], {
    message: "Selecione o tipo de loja",
  }),
  businessModel: z.enum(["farmacia", "manipulacao", "ecommerce"], {
    message: "Selecione o modelo de negócio",
  }),
  unitsCount: z.coerce.number().min(1, "Mínimo 1 unidade").max(10000, "Máximo 10.000 unidades"),
  erpSystem: z.string().min(2, "Nome do ERP é obrigatório").max(100, "Nome muito longo"),
});

export type RegistrationStep3Data = z.infer<typeof registrationStep3Schema>;

/**
 * Registration link form schema - Step 4 (Address)
 */
export const registrationStep4Schema = z.object({
  zipCode: cepSchema,
  state: z.enum(brazilianStates, {
    message: "Selecione o estado",
  }),
  city: z.string().min(2, "Cidade é obrigatória").max(100, "Nome muito longo"),
  neighborhood: z.string().min(2, "Bairro é obrigatório").max(100, "Nome muito longo"),
  street: z.string().min(2, "Rua é obrigatória").max(200, "Nome muito longo"),
  number: z.string().min(1, "Número é obrigatório").max(20, "Número muito longo"),
  complement: z.string().max(100, "Complemento muito longo").optional(),
});

export type RegistrationStep4Data = z.infer<typeof registrationStep4Schema>;

/**
 * Registration link form schema - Step 5 (Digital Presence)
 */
export const registrationStep5Schema = z.object({
  instagram: z.string().min(1, "Instagram é obrigatório").max(30, "Handle muito longo"),
  monthlyRevenue: z.enum(
    ["ate_30k", "30k_50k", "50k_100k", "100k_200k", "200k_500k", "500k_1m", "acima_1m"],
    { message: "Selecione a faixa de faturamento" },
  ),
});

export type RegistrationStep5Data = z.infer<typeof registrationStep5Schema>;

/**
 * Complete registration form data
 */
export interface RegistrationLinkFormData {
  // Step 1: Access Data
  email: string;
  password: string;
  confirmPassword: string;
  whatsapp: string;
  // Step 2: Responsible Data
  fullName: string;
  birthDate: string;
  cpf: string;
  // Step 3: Company Data
  cnpj: string;
  storeType: StoreType;
  businessModel: BusinessModel;
  unitsCount: number;
  erpSystem: string;
  // Step 4: Address
  zipCode: string;
  state: BrazilianState;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement?: string;
  // Step 5: Digital Presence
  instagram: string;
  monthlyRevenue: MonthlyRevenue;
}
