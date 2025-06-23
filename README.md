# FarmLink Backend

## Quick Project Setup

Follow these steps to set up the project locally:

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/FarmLink-ppp/farmlink-backend.git
   cd farmlink-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and configure the required environment variables:

   ```bash
   cp .env.example .env
   ```

   The required environment variables are:

   - `POSTGRES_USER`: The username for your PostgreSQL database.
   - `POSTGRES_PASSWORD`: The password for your PostgreSQL database.
   - `DATABASE_URL`: The connection string for your PostgreSQL database.
   - `JWT_SECRET`: A secret key used for signing JWT tokens.
   - `JWT_REFRESH_SECRET`: The expiration time for JWT tokens (e.g., `1h` for 1 hour).

4. Start the database (if using Docker) or set up PostgreSQL locally:
   If you have Docker installed, you can start the PostgreSQL database using Docker Compose (recommended approach):

   ```bash
   docker-compose up -d database
   ```

   Or, if you have PostgreSQL installed locally, ensure the database is running.

   1- navigate to services in windows and start the PostgreSQL service.
   3- create a new user with the username `your_username` and password `your_password`.
   4- create a new database with the name `farmlink` and assign the user you created as the owner.
   5- update the `.env` file with the database connection details.

   ```bash
   DATABASE_URL=postgresql://your_username:your_password@localhost:5432/farmlink
   ```

5. Run database migrations to set up the initial schema:

   ```bash
   npx prisma migrate deploy
   ```

   This command will apply the migrations defined in the `prisma/migrations` directory to your database.

6. Generate Prisma client:

   ```bash
   npx prisma generate
   ```

   This command will generate the Prisma client based on your schema.
   This step is necessary to ensure that the Prisma client is up to date with your database schema.

7. Start the development server:

   ```bash
   npm run start:dev
   ```

   This will start the server on `http://localhost:3000`.
   You can access the API documentation at `http://localhost:3000/api/docs`.
