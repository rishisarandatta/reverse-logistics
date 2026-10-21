# Reverse Logistics Management System

A web-based Reverse Logistics Management System developed using Next.js and MySQL to manage product returns, inspections, refunds, and inventory recovery.

## Technologies Used

- Frontend: Next.js
- Backend: Next.js API routes
- Database: MySQL
- Language: TypeScript / JavaScript
- Database connectivity: MySQL

## Getting Started

### 1. Clone the repository

```bash
git clone <https://github.com/rishisarandatta/reverse-logistics.git>
cd reverse-logistics
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env.local` file in the project root and configure your MySQL connection details using the environment variable names already used in your application.

Do not commit database credentials to GitHub.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Modules

- Dashboard: Overview of reverse logistics operations.
- Customer Management: Manage customer information.
- Product Management: Manage products and categories.
- Order Management: View and manage orders.
- Return Management: Process product returns and track their status.
- Database Operations: Perform SQL queries, view order details, and execute stored procedures.

## Database Features

The system uses MySQL to maintain structured data and relationships between customers, products, orders, and returns.

Database concepts demonstrated include:

- Primary and foreign keys
- Constraints and data integrity
- SQL views
- Stored procedures
- Transactions and rollback operations
- Relational queries and database integration

## Running the Project

Ensure that the MySQL server is running and the project database is configured correctly before starting the Next.js application.

```bash
npm run dev
```

## Project Purpose

The project demonstrates the application of database management concepts to a real-world reverse logistics workflow, connecting a web interface with a relational database.
