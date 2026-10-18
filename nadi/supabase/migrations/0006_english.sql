-- English as a third language (restaurant default for customers and push texts).
alter table public.restaurants drop constraint if exists restaurants_language_check;
alter table public.restaurants add constraint restaurants_language_check check (language in ('fr', 'ar', 'en'));
