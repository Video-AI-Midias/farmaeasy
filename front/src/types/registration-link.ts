/**
 * TypeScript types for registration links feature.
 */

// ==============================================================================
// API Response Types
// ==============================================================================

export interface CoursePreview {
  id: string;
  title: string;
  thumbnail_url?: string;
}

export interface ValidateLinkResponse {
  valid: boolean;
  shortcode: string;
  status: "pending" | "used" | "expired" | "revoked";
  expires_at?: string;
  courses: CoursePreview[];
  prefill_phone?: string;
  error?: string;
}

export interface CompleteRegistrationRequest {
  token: string;
  // Step 1: Access Data
  email: string;
  password: string;
  confirm_password: string;
  whatsapp: string;
  // Step 2: Responsible Data
  full_name: string;
  birth_date: string;
  cpf: string;
  // Step 3: Company Data
  cnpj: string;
  store_type: "associada" | "independente";
  business_model: "farmacia" | "manipulacao" | "ecommerce";
  units_count: number;
  erp_system: string;
  // Step 4: Address
  zip_code: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement?: string;
  // Step 5: Digital Presence
  instagram: string;
  monthly_revenue: string;
}

export interface CompleteRegistrationResponse {
  success: boolean;
  user_id: string;
  email: string;
  name: string;
  courses_granted: CoursePreview[];
  access_token: string;
  message: string;
  /** True if registration succeeded but some courses failed to grant */
  partial_success?: boolean;
  /** Course IDs that failed to grant (if partial_success=true) */
  failed_courses?: string[];
  /** Warning message for partial success scenarios */
  warning?: string;
}

// ==============================================================================
// ViaCEP API Response
// ==============================================================================

export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}
