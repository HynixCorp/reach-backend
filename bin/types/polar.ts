export interface PolarOrderDB {
  checkoutId: string;
  customerSessionToken: string;
  products: string[];
  fristDate: Date;
  paymentDate: Date;
  endDate: Date;
  betterAuthId: string;
  status: "active" | "expired";
  plan: "hobby" | "standard" | "pro" | null;
  subscriptionId: string | null;
}



export interface PolarCheckoutResponse {
  created_at: string;
  modified_at: string;
  id: string;
  custom_field_data: Record<string, unknown>;
  payment_processor: "stripe";
  status: "succeeded" | "pending" | "failed" | string;
  client_secret: string;
  url: string;
  expires_at: string;
  success_url: string;
  embed_origin: string | null;
  amount: number;
  discount_amount: number;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;

  product_id: string;
  product_price_id: string;
  discount_id: string | null;

  allow_discount_codes: boolean;
  require_billing_address: boolean;
  is_discount_applicable: boolean;
  is_free_product_price: boolean;
  is_payment_required: boolean;
  is_payment_setup_required: boolean;
  is_payment_form_required: boolean;

  customer_id: string;
  is_business_customer: boolean;
  customer_name: string | null;
  customer_email: string;
  customer_ip_address: string | null;
  customer_billing_name: string | null;

  customer_billing_address: {
    line1: string | null;
    line2: string | null;
    postal_code: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };

  customer_tax_id: string | null;

  payment_processor_metadata: {
    customer_id: string;
    intent_status: string;
    publishable_key: string;
    intent_client_secret: string;
  };

  customer_billing_address_fields: {
    country: boolean;
    state: boolean;
    city: boolean;
    postal_code: boolean;
    line1: boolean;
    line2: boolean;
  };

  billing_address_fields: {
    country: "required" | "optional" | "disabled";
    state: "required" | "optional" | "disabled";
    city: "required" | "optional" | "disabled";
    postal_code: "required" | "optional" | "disabled";
    line1: "required" | "optional" | "disabled";
    line2: "required" | "optional" | "disabled";
  };

  metadata: Record<string, unknown>;
  external_customer_id: string | null;
  customer_external_id: string | null;

  products: PolarProduct[];
  product: PolarProduct;
  product_price: PolarProductPrice;
  discount: PolarDiscount | null;

  subscription_id: string | null;
  attached_custom_fields: any[];
  customer_metadata: Record<string, unknown>;

  subtotal_amount: number;
}

export interface PolarProduct {
  created_at: string;
  modified_at: string;
  id: string;
  name: string;
  description: string | null;
  recurring_interval: string | null;
  is_recurring: boolean;
  is_archived: boolean;
  organization_id: string;
  prices: PolarProductPrice[];
  benefits: any[];
  medias: any[];
}

export interface PolarProductPrice {
  created_at: string;
  modified_at: string;
  id: string;
  amount_type: "fixed" | "metered" | string;
  is_archived: boolean;
  product_id: string;
  type: "recurring" | "one_time" | string;
  recurring_interval: string | null;
  price_currency: string;
  price_amount: number;
}

export interface PolarDiscount {
  id: string;
  code?: string;
  amount_off?: number;
  percent_off?: number;
  [key: string]: any;
}

// Customer Session Types
export interface PolarCustomerSessionResponse {
  created_at: string;
  modified_at: string | null;
  id: string;
  token: string;
  expires_at: string;
  customer_portal_url: string;
  customer_id: string;
  customer: PolarCustomer;
}

export interface PolarCustomer {
  id: string;
  created_at: string;
  modified_at: string | null;
  metadata: Record<string, unknown>;
  external_id: string | null;
  email: string;
  email_verified: boolean;
  name: string | null;
  billing_address: {
    line1: string | null;
    line2: string | null;
    postal_code: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };
  tax_id: string | null;
  organization_id: string;
  deleted_at: string | null;
  avatar_url: string | null;
}

//Customer Portal Me Types
export interface PolarCustomerMeResponse {
  created_at: string;
  modified_at: string | null;
  id: string;
  email: string;
  email_verified: boolean;
  name: string | null;

  billing_address: {
    line1: string | null;
    line2: string | null;
    postal_code: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };

  tax_id: [string, string] | null;

  oauth_accounts: Record<string, unknown>;

  default_payment_method_id: string | null;
}