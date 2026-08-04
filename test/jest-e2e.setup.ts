import 'dotenv/config';

const databaseUrl = new URL(process.env.DATABASE_URL!);
databaseUrl.pathname = '/payment_saas_test';
databaseUrl.searchParams.set('schema', 'public');
process.env.DATABASE_URL = databaseUrl.toString();
