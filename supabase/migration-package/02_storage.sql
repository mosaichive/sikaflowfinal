-- Storage buckets + policies (run after schema)
insert into storage.buckets (id,name,public) values ('business-logos','business-logos',true) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('avatars','avatars',true) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('other-income-receipts','other-income-receipts',false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('platform-ads','platform-ads',true) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('expense-receipts','expense-receipts',false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('email-media','email-media',false) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('database_export_05_08_26','database_export_05_08_26',false) on conflict (id) do nothing;

-- storage.objects policies
create policy 'Super admins delete email-media' on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'email-media'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'Super admins read email-media' on storage.objects as PERMISSIVE for SELECT to public using (((bucket_id = 'email-media'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'Super admins update email-media' on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'email-media'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'Super admins upload email-media' on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'email-media'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'avatars public read' on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'avatars'::text));
create policy 'avatars user delete' on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'avatars user update' on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'avatars user upload' on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'expense_receipts_delete_own' on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy 'expense_receipts_insert_own' on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy 'expense_receipts_select_own' on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy 'expense_receipts_update_own' on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'expense-receipts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy 'logos owner delete' on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'business-logos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'logos owner update' on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'business-logos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'logos owner upload' on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'business-logos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'logos public read' on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'business-logos'::text));
create policy 'other_income_receipts_delete_own' on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'other-income-receipts'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'other_income_receipts_insert_own' on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'other-income-receipts'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'other_income_receipts_select_own' on storage.objects as PERMISSIVE for SELECT to public using (((bucket_id = 'other-income-receipts'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'other_income_receipts_update_own' on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'other-income-receipts'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy 'platform-ads public read' on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'platform-ads'::text));
create policy 'platform-ads super admin delete' on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'platform-ads'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'platform-ads super admin update' on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'platform-ads'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
create policy 'platform-ads super admin write' on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'platform-ads'::text) AND has_role(auth.uid(), 'super_admin'::app_role)));
