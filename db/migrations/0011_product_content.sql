ALTER TABLE product
  ADD COLUMN short_description text NOT NULL DEFAULT '' CHECK(char_length(short_description)<=600),
  ADD COLUMN care_instructions text NOT NULL DEFAULT '' CHECK(char_length(care_instructions)<=4000),
  ADD COLUMN approved_warnings text NOT NULL DEFAULT '' CHECK(char_length(approved_warnings)<=4000);
