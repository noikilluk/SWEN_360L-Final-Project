# BatchBite: Requirements Document

**Version:** 0.1 (Sprint 1)
**Project:** BatchBite, a preorder and production platform for small food businesses

## 1. Purpose
BatchBite helps home bakers, student food stalls and small kitchens manage limited
production through advance orders. It replaces scattered messages and manual records
with one reliable order book.

## 2. User Roles
|                         Role                                   |                        Description                                |
|----------------------------------------------------------------|-------------------------------------------------------------------|
| Customer                                                       | Browses batches, places orders, picks a pickup slot, tracks status|
| Business Owner                                                 | Creates products and batches views orders records cancellations   |
| Kitchen Staff                                                  | Updates production progress and order status                      |
| Administrator                                                  | Manages accounts and system settings                              |

## 3. User Stories
| ID    | Story                                                                                                                   | Priority |
|-------|-------------------------------------------------------------------------------------------------------------------------|----------|
| US-01 | As a customer, I want to create an account so that I can place and track orders.                                        | High     |
| US-02 | As a customer, I want to browse available batches with photos, prices and deadlines so that I can choose what to order. | High     |
| US-03 | As a customer, I want to add items to a cart and check out so that I can confirm my order.                              | High     |
| US-04 | As a customer, I want to select a pickup slot so that I know when to collect.                                           | High     |
| US-05 | As a customer, I want to see my order status so that I know when it is ready.                                           | Medium   |
| US-06 | As a business owner, I want to create a batch with a maximum quantity and deadline so that I never oversell.            | High     |
| US-07 | As a business owner, I want to see all confirmed orders in a dashboard so that I know what to prepare.                  | High     |
| US-08 | As kitchen staff, I want to update an order from Preparing to Ready so that customers are informed.                     | Medium   |

## 4. Functional Requirements
| ID    | Requirement                                                                                                        | Linked Story |
|-------|--------------------------------------------------------------------------------------------------------------------|--------------|
| FR-01 | The system shall support four roles: customer, owner, kitchen staff, administrator.                                | US-01        |
| FR-02 | The system shall let owners create product listings with description, price, variants and quantity.                | US-06        |
| FR-03 | The system shall let owners create a production batch with a maximum quantity, order deadline and collection date. | US-06        |
| FR-04 | The system shall reject an order when the batch has no remaining quantity.                                         | US-03        |
| FR-05 | The system shall close ordering automatically after the batch deadline.                                            | US-06        |
| FR-06 | The system shall limit orders per pickup slot to a configurable maximum.                                           | US-04        |
| FR-07 | The system shall simulate payment and show an order summary at checkout.                                           | US-03        |
| FR-08 | The system shall move orders through Confirmed → Preparing → Ready → Collected and block invalid transitions.      | US-05, US-08 |
| FR-09 | The system shall show owners a dashboard of orders per batch.                                                      | US-07        |


## 5. Non-Functional Requirements
| ID     | Category        | Requirement                                                                  |
|--------|-----------------|------------------------------------------------------------------------------|
| NFR-01 | Concurrency     | Two simultaneous requests shall never both reserve the last remaining unit.  |
| NFR-02 | Performance     | Main pages shall load within 3 seconds under normal use.                     |
| NFR-03 | Security        | Passwords shall be stored hashed; customers can only view their own orders.  |
| NFR-04 | Usability       | A customer shall be able to complete an order in under 2 minutes on a phone. |
| NFR-05 | Maintainability | The README shall explain how to install and run the project.                 |

## 6. Out of Scope for Sprint 1
Ingredient planning, QR code collection, notifications, recipe versioning and sales
insights are planned for later sprints.
