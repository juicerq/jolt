UPDATE `messages` SET `question` = json_set(`question`, '$.multiple', json('false')) WHERE json_type(`question`) = 'object';--> statement-breakpoint
UPDATE `messages` SET `reply_to` = json_object('messageId', json_extract(`reply_to`, '$.messageId'), 'optionValues', json_array(json_extract(`reply_to`, '$.optionValue'))) WHERE json_type(`reply_to`, '$.optionValue') = 'text';
