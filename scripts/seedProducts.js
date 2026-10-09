require("dotenv").config({ quiet: true });
const { MongoClient, ObjectId } = require("mongodb");

const SELLER_ID = "650000000000000000000002";

const items = [
  {
    title: "Used Dell Inspiron 15 Laptop",
    category: "Electronics",
    condition: "Good",
    price: 35000,
    rating: 4.8,
    reviews: 24,
    location: "Dhaka",
    seller: "Rahim Ahmed",
    description:
      "A reliable Dell Inspiron laptop suitable for study, programming and everyday work. Runs smoothly and comes with its original charger.",
    image:
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Modern Wooden Study Table",
    category: "Furniture",
    condition: "Like New",
    price: 8500,
    rating: 4.7,
    reviews: 18,
    location: "Chattogram",
    seller: "Nafisa Karim",
    description:
      "A clean and durable wooden study table with enough space for a laptop, books and other study materials.",
    image:
      "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "iPhone 13 128GB",
    category: "Mobile Phones",
    condition: "Good",
    price: 42000,
    rating: 4.9,
    reviews: 37,
    location: "Dhaka",
    seller: "Sabbir Hasan",
    description:
      "iPhone 13 with 128GB storage. Smooth performance, healthy battery and a clean overall appearance. Box and charger included.",
    image:
      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Mountain Bike",
    category: "Sports",
    condition: "Good",
    price: 18000,
    rating: 4.6,
    reviews: 12,
    location: "Sylhet",
    seller: "Tanvir Hossain",
    description:
      "A well-maintained mountain bike suitable for daily commuting, exercise and outdoor riding. Gears and brakes work perfectly.",
    image:
      "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Canon EOS DSLR Camera",
    category: "Electronics",
    condition: "Good",
    price: 28000,
    rating: 4.7,
    reviews: 15,
    location: "Rajshahi",
    seller: "Imran Khan",
    description:
      "Canon DSLR in good working condition, great for photography beginners. Includes a lens, battery and camera bag.",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Comfortable Fabric Sofa",
    category: "Furniture",
    condition: "Fair",
    price: 15000,
    rating: 4.5,
    reviews: 9,
    location: "Khulna",
    seller: "Maliha Rahman",
    description:
      "A three-seater fabric sofa with comfortable cushions. Some minor signs of use, but the frame is strong and sturdy.",
    image:
      "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Sony Wireless Headphones",
    category: "Electronics",
    condition: "Like New",
    price: 6500,
    rating: 4.8,
    reviews: 21,
    location: "Dhaka",
    seller: "Nusrat Jahan",
    description:
      "Sony wireless headphones with clear sound and long battery life. Used only a few times and kept in perfect condition.",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Nike Running Shoes",
    category: "Fashion",
    condition: "Like New",
    price: 3200,
    rating: 4.6,
    reviews: 14,
    location: "Chattogram",
    seller: "Arif Hossain",
    description:
      "Lightweight Nike running shoes, size 42. Very comfortable and barely used, with no visible wear.",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Samsung Galaxy S22",
    category: "Mobile Phones",
    condition: "Like New",
    price: 38000,
    rating: 4.8,
    reviews: 19,
    location: "Dhaka",
    seller: "Rifat Chowdhury",
    description:
      "Samsung Galaxy S22 with excellent performance, display quality and camera. Comes with the original box and charger.",
    image:
      "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Modern Office Chair",
    category: "Furniture",
    condition: "Like New",
    price: 6500,
    rating: 4.6,
    reviews: 11,
    location: "Dhaka",
    seller: "Fahim Rahman",
    description:
      "Comfortable ergonomic office chair suitable for studying and working from home.",
    image:
      "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Gaming Desk",
    category: "Furniture",
    condition: "Good",
    price: 9500,
    rating: 4.4,
    reviews: 8,
    location: "Noakhali",
    seller: "Shakil Ahmed",
    description:
      "Spacious gaming and computer desk with a clean modern design and plenty of space for a full setup.",
    image:
      "https://images.unsplash.com/photo-1617098900591-3f90928e8c54?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Leather Backpack",
    category: "Fashion",
    condition: "Like New",
    price: 3200,
    rating: 4.5,
    reviews: 16,
    location: "Dhaka",
    seller: "Adnan Kabir",
    description:
      "Stylish and durable backpack with enough space for books, a laptop and daily essentials.",
    image:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
  },
];

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db("resellHub");

  const seller = await db
    .collection("users")
    .findOne({ _id: new ObjectId(SELLER_ID) });

  if (!seller) {
    console.error("Test Seller user not found");
    await client.close();
    process.exit(1);
  }

  let inserted = 0;

  for (const item of items) {
    const exists = await db
      .collection("products")
      .findOne({ title: item.title, seeded: true });

    if (exists) continue;

    await db.collection("products").insertOne({
      title: item.title,
      category: item.category,
      condition: item.condition,
      price: item.price,
      stock: 3,
      images: [item.image],
      description: item.description,
      rating: item.rating,
      reviews: item.reviews,
      sellerInfo: {
        userId: seller._id.toString(),
        name: item.seller,
        email: seller.email,
        phone: seller.phone || "",
      },
      location: item.location,
      status: "approved",
      seeded: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    inserted += 1;
  }

  console.log(`Inserted ${inserted} products`);
  await client.close();
})();
