-- Enable RLS on key tables
alter table subscriptions enable row level security;
alter table transactions enable row level security;
alter table batch_usage enable row level security;

-- Drop existing policies if any (to prevent errors if re-running)
drop policy if exists "Users can view own subscription" on subscriptions;
drop policy if exists "Users can view own transactions" on transactions;
drop policy if exists "Users can view own batch usage" on batch_usage;

-- Create policies for Subscriptions
create policy "Users can view own subscription"
on subscriptions for select
using (auth.uid() = user_id);

-- Create policies for Transactions
create policy "Users can view own transactions"
on transactions for select
using (auth.uid() = user_id);

-- Create policies for Batch Usage
create policy "Users can view own batch usage"
on batch_usage for select
using (auth.uid() = user_id);
