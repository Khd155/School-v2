-- Maximum grade per item, set by the teacher in «معلومات المدرسة» (JSON object; null = not set).
-- Defaults confirmed by the teacher for this term.
ALTER TABLE app_settings ADD COLUMN score_max TEXT NOT NULL DEFAULT '{"homework":15,"participation":15,"performance":10,"classworkTotal":40,"quran":20,"exams":40,"quranExamsTotal":60,"finalTotal":100}';
