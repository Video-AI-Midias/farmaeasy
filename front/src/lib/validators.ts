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
