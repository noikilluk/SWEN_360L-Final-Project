# Comparing Architectural Styles Report

Having completed Phase 2, we wanted to see what other styles of architecture our app uses, and what it might look like if built using different styles. We went with three: layered, client-server and microservices.

## Layered (MVC)

We ended up using this style, in essence, even if we didn't plan for it in the beginning. The app is made up of three layers. The top is the user interface, made up of screens such as the login, batch cards, and customer and owner dashboards. The middle layer is made up of the rules and constraints of the app. You can't book a pickup slot that's already booked. An order is filled by going through the steps of confirmed, preparing, and then ready. The bottom layer is made up of the persistence layer. For us, that means local storage.

The screens never access the data directly, rather they go through the rules to see if a batch is sold out, for example. In that case, the home screen would be told to gray out the batch, and then show that to the user. The nice thing about this architecture is that when something broke, we always knew where to look. The downside is that with one large app, if we changed one thing, we could break something else.

## Client-Server

This one splits the app in two. The client is what’s on your phone, and the server is a separate computer somewhere that holds all the data. Your phone asks for something, the server sends it back. This would actually fix one of our biggest problems. Right now, because we use local storage, the customer, owner and kitchen sides only really share data on the same device. That’s fine for a demo, but it’s not how a real bakery works. With a server, a customer could order from their own phone at home and it would pop up on the owner’s dashboard and the kitchen board straight away. The QR scan would mean a lot more too, since the kitchen would be checking against real orders.

The catch is you need to set up and pay for a server, and the app stops working without internet. For a project with demo accounts and fake payments, it wasn’t worth it yet.

## Microservices

This is the most extreme of the three. Instead of one backend, you break everything into lots of small separate pieces that each do one thing. For us that might be one for logins, one for products, one for batches and stock, one for orders, one for notifications, and one for the insights charts. The nice part is that if one piece goes down, the rest keep working. If notifications crashed, people could still order. You can also beef up just the part that’s struggling, like if the insights page got slow.

But for five students making a bakery app, this would be way overkill. Every piece needs its own setup, they all have to talk to each other, and finding bugs becomes a nightmare. It’s really meant for big companies with big teams.

### So which one makes sense?

Basically it comes down to how simple you want it versus how much you expect it to grow. Layered was the easiest to build and it fit what we needed for Phase 2. If we kept working on the app, client-server would probably be our next move so different people on different devices could all see the same orders. Microservices would only make sense if this turned into something way bigger than one bakery.
