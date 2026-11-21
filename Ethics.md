Ethics in Phase 2

We wanted to consider how our app interacts with users. There were several ethical issues that came up as we worked on the app.

Minimizing stored personal data

We didn’t want the app to collect more data than is necessary. That is part of the reason we have demo accounts on the login page. That way, when people test the app, they don’t have to create a ton of user accounts and fill the storage with unneeded user data. Payment and cards are simulated for now, so no one types in their card data. We also didn’t want to take anyone’s financial data before we can do it properly and securely.

Honesty about allergens and ingredients

Because food can actually hurt people, we felt strongly about this feature. Each item page has an area that can be expanded to show the ingredients and allergens. The cart page has a text box where people can tell the baker about allergens. On the owner side, if an ingredients changes for a recipe, the product editor shows the owner what changed and gives the owner a text box to explain why it was changed. A customer should never be surprised by a new ingredient they are allergic to.

Not misleading customers

We tried to keep the home page honest. The stock bar shows how much is really left, and labels like “Closing soon” and “Sold out” match the actual state of the batch. We didn’t want fake urgency to push people into buying. We also don’t let customers book pickup slots that are already full, so nobody is promised something the bakery can’t deliver.

Fairness when orders change

When a customer asks to change an order, it doesn’t just go through on its own. The owner reviews it and approves or declines it. The change screen tells customers this up front and says the price might stay the same or they might get a refund depending on the change, so they know what to expect before they ask. Customers can also request a cancellation instead of being stuck with an order.

Making sure the right person gets the order

The QR code at pickup is there so the order goes to the person who actually placed it. The kitchen scans the code, or types it in if the camera doesn’t work, before handing anything over. It’s a small thing, but it stops someone from walking off with another person’s order.

Only seeing what you need to see

Each role (customer, owner, kitchen and admin) only gets the screens for their job. Customers can’t see the owner’s sales or other people’s orders, and kitchen staff see what needs to be made, not the business numbers. Password resets go through the admin, who can give a temporary password, so accounts aren’t just handed over to anyone who asks.

What we’d still need to work on

To be honest, local storage isn’t very secure. Anyone using the same device could get to the data, and it isn’t protected the way a real database would be. That was fine for Phase 2, but if this were used by a real bakery, we’d need proper security for logins and stored data, plus real, safe payment handling.
