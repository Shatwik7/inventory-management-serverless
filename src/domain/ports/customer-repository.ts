import type { Customer } from "../entities/customer";

export type CustomerRepository = {
  create(customer: Customer): Promise<void>;
  update(customer: Customer): Promise<void>;
  findById(customerId: string): Promise<Customer | null>;
  findAll(): Promise<Customer[]>;
};
