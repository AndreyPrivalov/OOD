ALTER TABLE "work_items"
ADD CONSTRAINT "work_items_title_not_empty" CHECK (btrim(title) <> '');
