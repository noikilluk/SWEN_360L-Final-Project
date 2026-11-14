import { AdminService } from './admin-service';
import { AuthService } from './auth-service';
import { BatchService } from './batch-service';
import { CartService } from './cart-service';
import { CatalogueService } from './catalogue-service';
import type { ServiceContext } from './context';
import { NotificationService } from './notification-service';
import { OrderService } from './order-service';
import { ProductionService } from './production-service';

export type Services = ReturnType<typeof createServices>;

/** Builds every service around one database, crypto provider and clock. */
export function createServices(ctx: ServiceContext) {
  return {
    ctx,
    auth: new AuthService(ctx),
    admin: new AdminService(ctx),
    catalogue: new CatalogueService(ctx),
    batches: new BatchService(ctx),
    cart: new CartService(ctx),
    orders: new OrderService(ctx),
    production: new ProductionService(ctx),
    notifications: new NotificationService(ctx),
  };
}
