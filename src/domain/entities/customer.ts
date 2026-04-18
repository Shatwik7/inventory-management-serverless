export type CustomerPayment = {
  paymentId: string;
  amount: number;
  paidAt: string;
  note?: string;
};

export type Customer = {
  customerId: string;
  name: string;
  currentBalance: number;
  payments: CustomerPayment[];
  createdAt: string;
  updatedAt: string;
};
