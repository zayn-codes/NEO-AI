import asyncio
import asyncpg
import json

async def main():
    db_url = "postgresql://postgres:0009@localhost:5432/literacy_db"
    print("Connecting to seed the database...")
    try:
        conn = await asyncpg.connect(db_url)
        print("Connected. Clearing old curriculum, lessons, assessments data...")
        
        # Truncate tables to restart identity sequences
        await conn.execute("""
            TRUNCATE TABLE lesson_content, lessons, assessments, curriculum RESTART IDENTITY CASCADE;
        """)
        print("Truncated tables.")

        # 1. Insert Curriculum categories
        curriculums = [
            # Beginner
            {"difficulty": "Beginner", "category": "Alphabet", "order": 1},
            {"difficulty": "Beginner", "category": "Basic Words", "order": 2},
            {"difficulty": "Beginner", "category": "Simple Sentences", "order": 3},
            # Intermediate
            {"difficulty": "Intermediate", "category": "Vocabulary", "order": 4},
            {"difficulty": "Intermediate", "category": "Paragraph Reading", "order": 5},
            {"difficulty": "Intermediate", "category": "Grammar", "order": 6},
            # Advanced
            {"difficulty": "Advanced", "category": "Essay Writing", "order": 7},
            {"difficulty": "Advanced", "category": "Communication Skills", "order": 8},
            {"difficulty": "Advanced", "category": "Reading Comprehension", "order": 9},
        ]
        
        curr_map = {}
        for c in curriculums:
            curr_id = await conn.fetchval("""
                INSERT INTO curriculum (difficulty_level, category, sequence_order)
                VALUES ($1, $2, $3)
                RETURNING curriculum_id;
            """, c["difficulty"], c["category"], c["order"])
            curr_map[(c["difficulty"], c["category"])] = curr_id
            print(f"Inserted Curriculum: {c['difficulty']} - {c['category']} (ID: {curr_id})")

        # 2. Insert Lessons & Multilingual Content
        lessons_data = [
            # Beginner: Alphabet
            {
                "difficulty": "Beginner", "category": "Alphabet", "title_key": "lesson_alphabet_sounds",
                "en": {"title": "Alphabet Sounds", "body": "Learn how the letters A, B, C, and D sound. Practice saying: A for Apple, B for Ball, C for Cat, D for Dog.", "exercise": {"type": "read", "text": "A B C D"}},
                "hi": {"title": "वर्णमाला की आवाजें", "body": "सीखें कि A, B, C और D अक्षरों की आवाज कैसी होती है। अभ्यास करें: A से Apple (सेब), B से Ball (गेंद), C से Cat (बिल्ली), D से Dog (कुत्ता)।", "exercise": {"type": "read", "text": "ए बी सी डी"}},
                "kn": {"title": "ವರ್ಣಮಾಲೆಯ ಧ್ವನಿಗಳು", "body": "A, B, C ಮತ್ತು D ಅಕ್ಷರಗಳು ಹೇಗೆ ಧ್ವನಿಸುತ್ತವೆ ಎಂಬುದನ್ನು ಕಲಿಯಿರಿ. ಅಭ್ಯಾಸ ಮಾಡಿ: A ಅಂದರೆ ಆಪಲ್, B ಅಂದರೆ ಬಾಲ್, C ಅಂದರೆ ಕ್ಯಾಟ್, D ಅಂದರೆ ಡಾಗ್.", "exercise": {"type": "read", "text": "ಎ ಬಿ ಸಿ ಡಿ"}},
                "uz": {"title": "Alifbo va tovushlar", "body": "A, B, D va E harflarining talaffuzini o'rganing. Mashq qiling: A - Olma, B - Bola, D - Dars, E - Eshik.", "exercise": {"type": "read", "text": "A B D E"}}
            },
            # Beginner: Basic Words
            {
                "difficulty": "Beginner", "category": "Basic Words", "title_key": "lesson_daily_greetings",
                "en": {"title": "Greetings", "body": "Hello! Nice to meet you. Good morning, and thank you are polite words we use every day.", "exercise": {"type": "speak", "text": "Hello, thank you"}},
                "hi": {"title": "दैनिक अभिवादन", "body": "नमस्ते! आपसे मिलकर अच्छा लगा। सुप्रभात, और धन्यवाद ऐसे विनम्र शब्द हैं जिनका हम हर दिन उपयोग करते हैं।", "exercise": {"type": "speak", "text": "नमस्ते, धन्यवाद"}},
                "kn": {"title": "ದಿನನಿತ್ಯದ ಶುಭಾಶಯಗಳು", "body": "ನಮಸ್ಕಾರ! ನಿಮ್ಮನ್ನು ಭೇಟಿಯಾಗಲು ಸಂತೋಷವಾಗಿದೆ. ಶುಭೋದಯ ಮತ್ತು ಧನ್ಯವಾದಗಳು ಪ್ರತಿದಿನ ನಾವು ಬಳಸುವ ವಿನಮ್ರ ಪದಗಳಾಗಿವೆ.", "exercise": {"type": "speak", "text": "ನಮಸ್ಕಾರ, ಧನ್ಯವಾದಗಳು"}},
                "uz": {"title": "Kundalik salomlashish", "body": "Assalomu alaykum! Xayrli tong, rahmat va ko'rishguncha so'zlarini har kuni ishlatamiz.", "exercise": {"type": "speak", "text": "Assalomu alaykum, rahmat"}}
            },
            # Beginner: Simple Sentences
            {
                "difficulty": "Beginner", "category": "Simple Sentences", "title_key": "lesson_simple_actions",
                "en": {"title": "Simple Actions", "body": "Read this out loud: The sun is hot. The sky is blue. A cat sits on a mat.", "exercise": {"type": "read", "text": "The cat sits on a mat"}},
                "hi": {"title": "सरल क्रियाएं", "body": "इसे जोर से पढ़ें: सूरज गर्म है। आसमान नीला है। बिल्ली चटाई पर बैठी है।", "exercise": {"type": "read", "text": "बिल्ली चटाई पर बैठी है"}},
                "kn": {"title": "ಸರಳ ವಾಕ್ಯಗಳು", "body": "ಇದನ್ನು ಗಟ್ಟಿಯಾಗಿ ಓದಿ: ಸೂರ್ಯನು ಬಿಸಿಯಾಗಿದ್ದಾನೆ. ಆಕಾಶವು ನೀಲಿಯಾಗಿದೆ. ಬೆಕ್ಕು ಚಾಪೆಯ ಮೇಲೆ ಕುಳಿತಿದೆ.", "exercise": {"type": "read", "text": "ಬೆಕ್ಕು ಚಾಪೆಯ ಮೇಲೆ ಕುಳಿತಿದೆ"}},
                "uz": {"title": "Oddiy gaplar", "body": "Ovoz chiqarib o'qing: Quyosh charaqlamoqda. Osmon moviy. Mushuk gilamda o'tiribdi.", "exercise": {"type": "read", "text": "Mushuk gilamda o'tiribdi"}}
            },
            
            # Intermediate: Vocabulary
            {
                "difficulty": "Intermediate", "category": "Vocabulary", "title_key": "lesson_market_items",
                "en": {"title": "Fruit Market Words", "body": "Learn fruits and objects: Apple, Banana, Orange, Mango, Table, Spoon, Glass.", "exercise": {"type": "match", "words": ["Apple", "Mango", "Table"]}},
                "hi": {"title": "फल और बाजार के शब्द", "body": "फल और वस्तुओं के नाम सीखें: सेब, केला, संतरा, आम, मेज, चम्मच, गिलास।", "exercise": {"type": "match", "words": ["सेब", "आम", "मेज"]}},
                "kn": {"title": "ಹಣ್ಣು ಮತ್ತು ಮಾರುಕಟ್ಟೆ ಪದಗಳು", "body": "ಹಣ್ಣುಗಳು ಮತ್ತು ವಸ್ತುಗಳನ್ನು ಕಲಿಯಿರಿ: ಸೇಬು, ಬಾಳೆಹಣ್ಣು, ಕಿತ್ತಳೆ, ಮಾವು, ಮೇಜು, ಚಮಚ, ಲೋಟ.", "exercise": {"type": "match", "words": ["ಸೇಬು", "ಮಾವು", "ಮೇಜು"]}},
                "uz": {"title": "Bozor va mevalar", "body": "Mevalar va buyumlarni o'rganing: Olma, Banan, Apelsin, Anor, Stol, Qoshiq, Stakan.", "exercise": {"type": "match", "words": ["Olma", "Anor", "Stol"]}}
            },
            # Intermediate: Paragraph Reading
            {
                "difficulty": "Intermediate", "category": "Paragraph Reading", "title_key": "lesson_farmer_story",
                "en": {"title": "The Farmer's Morning", "body": "Raju is a hard-working farmer. He gets up at five o'clock in the morning. He takes his cows to the field. He grows sweet rice and green vegetables.", "exercise": {"type": "read", "text": "Raju is a hard-working farmer"}},
                "hi": {"title": "किसान की सुबह", "body": "राजू एक मेहनती किसान है। वह सुबह पांच बजे उठता है। वह अपनी गायों को खेत में ले जाता है। वह मीठे चावल और हरी सब्जियां उगाता है।", "exercise": {"type": "read", "text": "राजू एक मेहनती किसान है"}},
                "kn": {"title": "ರೈತನ ಬೆಳಗಿನ ದಿನಚರಿ", "body": "ರಾಜು ಕಷ್ಟಪಟ್ಟು ಕೆಲಸ ಮಾಡುವ ರೈತ. ಅವನು ಬೆಳಿಗ್ಗೆ ಐದು ಗಂಟೆಗೆ ಏಳುತ್ತಾನೆ. ಅವನು ತನ್ನ ಹಸುಗಳನ್ನು ಗದ್ದೆಗೆ ಕರೆದುಕೊಂಡು ಹೋಗುತ್ತಾನೆ. ಅವನು ಸಿಹಿ ಅಕ್ಕಿ ಮತ್ತು ಹಸಿರು ತರಕಾರಿಗಳನ್ನು ಬೆಳೆಯುತ್ತಾನೆ.", "exercise": {"type": "read", "text": "ರಾಜು ಕಷ್ಟಪಟ್ಟು ಕೆಲಸ ಮಾಡುವ ರೈತ"}},
                "uz": {"title": "Dehqonning tongi", "body": "Raju - mehnatkash dehqon. U erta tongda soat beshda uyg'onadi va dalaga boradi. U shirin mevalar va sabzavotlar yetishtiradi.", "exercise": {"type": "read", "text": "Raju mehnatkash dehqon"}}
            },
            # Intermediate: Grammar
            {
                "difficulty": "Intermediate", "category": "Grammar", "title_key": "lesson_action_verbs",
                "en": {"title": "Action Verbs", "body": "Verbs are action words. In 'She runs to the shop' and 'The boy sings a song', 'runs' and 'sings' are verbs.", "exercise": {"type": "quiz", "question": "Identify the verb: The fish swims.", "options": ["The", "swims", "fish"], "answer": "swims"}},
                "hi": {"title": "क्रिया शब्द (Verbs)", "body": "क्रिया का अर्थ है काम वाले शब्द। जैसे: 'वह दुकान की तरफ दौड़ती है' में 'दौड़ती' और 'लड़का गाना गाता है' में 'गाता' क्रिया हैं।", "exercise": {"type": "quiz", "question": "क्रिया पहचानें: मछली तैरती है।", "options": ["मछली", "तैरती", "है"], "answer": "तैरती"}},
                "kn": {"title": "ಕ್ರಿಯಾಪದಗಳು (Verbs)", "body": "ಕ್ರಿಯಾಪದಗಳು ಎಂದರೆ ಕೆಲಸವನ್ನು ಸೂಚಿಸುವ ಪದಗಳು. 'ಅವಳು ಅಂಗಡಿಗೆ ಓಡುತ್ತಾಳೆ' ಮತ್ತು 'ಹುಡುಗ ಹಾಡು ಹಾಡುತ್ತಾನೆ' ವಾಕ್ಯಗಳಲ್ಲಿ 'ಓಡುತ್ತಾಳೆ' ಮತ್ತು 'ಹಾಡುತ್ತಾನೆ' ಕ್ರಿಯಾಪದಗಳಾಗಿವೆ.", "exercise": {"type": "quiz", "question": "ಕ್ರಿಯಾಪದವನ್ನು ಗುರುತಿಸಿ: ಮೀನು ಈಜುತ್ತದೆ.", "options": ["ಮೀನು", "ಈಜುತ್ತದೆ", "ಇದೆ"], "answer": "ಈಜುತ್ತದೆ"}},
                "uz": {"title": "Harakat fe'llari (Fe'l)", "body": "Fe'l harakat va holatni bildiradi. Masalan: 'Baliq suzmoqda' gapida 'suzmoqda' fe'ldir.", "exercise": {"type": "quiz", "question": "Fe'lni toping: Baliq suvda suzadi.", "options": ["suvda", "suzadi", "baliq"], "answer": "suzadi"}}
            },

            # Advanced: Essay Writing
            {
                "difficulty": "Advanced", "category": "Essay Writing", "title_key": "lesson_letter_format",
                "en": {"title": "Writing a Simple Letter", "body": "Learn to write a friendly letter. Start with: Dear [Name], write your message, and end with: Yours truly, [Your Name].", "exercise": {"type": "write", "prompt": "Write a short letter to your brother."}},
                "hi": {"title": "एक सरल पत्र लिखना", "body": "एक अनौपचारिक पत्र लिखना सीखें। शुरुआत करें: प्रिय [नाम], अपना संदेश लिखें, और अंत में लिखें: आपका प्रिय, [आपका नाम]।", "exercise": {"type": "write", "prompt": "अपने भाई को एक छोटा पत्र लिखें।"}},
                "kn": {"title": "ಸರಳ ಪತ್ರ ಬರೆಯುವುದು", "body": "ಸ್ನೇಹಪೂರ್ವಕ ಪತ್ರವನ್ನು ಬರೆಯಲು ಕಲಿಯಿರಿ. ಹೀಗೆ ಪ್ರಾರಂಭಿಸಿ: ಆತ್ಮೀಯ [ಹೆಸರು], ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಬರೆಯಿರಿ ಮತ್ತು ಕೊನೆಯಲ್ಲಿ: ನಿಮ್ಮ ನಂಬಿಕಸ್ಥ, [ನಿಮ್ಮ ಹೆಸರು] ಎಂದು ಮುಗಿಸಿ.", "exercise": {"type": "write", "prompt": "ನಿಮ್ಮ ಸಹೋದರನಿಗೆ ಒಂದು ಸಣ್ಣ ಪತ್ರ ಬರೆಯಿರಿ."}},
                "uz": {"title": "Oddiy xat yozish", "body": "Do'stona xat yozishni o'rganing. Boshlanishi: Hurmatli [Ism], xabaringizni yozing va oxirida: Hurmat bilan, [Sizning Ismingiz].", "exercise": {"type": "write", "prompt": "Do'stingizga qisqa xat yozing."}}
            },
            # Advanced: Communication Skills
            {
                "difficulty": "Advanced", "category": "Communication Skills", "title_key": "lesson_self_intro",
                "en": {"title": "Introducing Yourself", "body": "When introducing yourself, smile, stand straight, state your name clearly, and say: 'Hello, my name is Raju. I want to learn digital literacy.'", "exercise": {"type": "speak", "text": "Hello my name is Raju"}},
                "hi": {"title": "अपना परिचय देना", "body": "अपना परिचय देते समय, मुस्कुराएं, सीधे खड़े हों, अपना नाम स्पष्ट रूप से बताएं और कहें: 'नमस्ते, मेरा नाम राजू है। मैं डिजिटल साक्षरता सीखना चाहता हूँ।'", "exercise": {"type": "speak", "text": "नमस्ते मेरा नाम राजू है"}},
                "kn": {"title": "ನಿಮ್ಮನ್ನು ಪರಿಚಯಿಸಿಕೊಳ್ಳುವುದು", "body": "ನಿಮ್ಮನ್ನು ಪರಿಚಯಿಸಿಕೊಳ್ಳುವಾಗ, ನಕ್ಕು, ನೇರವಾಗಿ ನಿಂತು, ನಿಮ್ಮ ಹೆಸರನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಹೇಳಿ: 'ನಮಸ್ಕಾರ, ನನ್ನ ಹೆಸರು ರಾಜು. ನಾನು ಸಾಕ್ಷರತೆಯನ್ನು ಕಲಿಯಲು ಬಯಸುತ್ತೇನೆ.'", "exercise": {"type": "speak", "text": "ನಮಸ್ಕಾರ ನನ್ನ ಹೆಸರು ರಾಜು"}},
                "uz": {"title": "O'zini tanishtirish", "body": "O'zingizni tanishtirganda, tabassum qiling va aniq ayting: 'Assalomu alaykum, mening ismim Raju. Men yangi bilimlar o'rganmoqchiman.'", "exercise": {"type": "speak", "text": "Assalomu alaykum mening ismim Raju"}}
            },
            # Advanced: Reading Comprehension
            {
                "difficulty": "Advanced", "category": "Reading Comprehension", "title_key": "lesson_thirsty_crow",
                "en": {"title": "The Thirsty Crow", "body": "A thirsty crow found a pitcher with very little water. He dropped small pebbles into the pitcher one by one. The water rose to the top, and he drank it happily. Moral: Where there is a will, there is a way.", "exercise": {"type": "quiz", "question": "What did the crow drop in the pitcher?", "options": ["Leaves", "Pebbles", "Sweets", "Sand"], "answer": "Pebbles"}},
                "hi": {"title": "प्यासा कौआ", "body": "एक प्यासे कौवे को एक घड़ा मिला जिसमें बहुत कम पानी था। उसने एक-एक करके घड़े में छोटे-छोटे कंकड़ डाले। पानी ऊपर आ गया और उसने खुशी-खुशी उसे पी लिया। सीख: जहाँ चाह, वहाँ राह।", "exercise": {"type": "quiz", "question": "कौवे ने घड़े में क्या डाला?", "options": ["पत्ते", "कंकड़", "मिठाई", "रेत"], "answer": "कंकड़"}},
                "kn": {"title": "ಬಾಯಾರಿದ ಕಾಗೆ", "body": "ಬಾಯಾರಿದ ಕಾಗೆಯೊಂದಕ್ಕೆ ಬಹಳ ಕಡಿಮೆ ನೀರಿದ್ದ ಹೂಜಿ ಸಿಕ್ಕಿತು. ಅವನು ಒಂದೊಂದಾಗಿ ಸಣ್ಣ ಕಲ್ಲುಗಳನ್ನು ಹೂಜಿಗೆ ಹಾಕಿದನು. ನೀರು ಮೇಲಕ್ಕೆ ಬಂದಿತು, ಮತ್ತು ಅವನು ಸಂತೋಷದಿಂದ ಕುಡಿದನು. ನೀತಿ: ಮನಸ್ಸಿದ್ದರೆ ಮಾರ್ಗ.", "exercise": {"type": "quiz", "question": "ಕಾಗೆಯು ಹೂಜಿಯಲ್ಲಿ ಏನು ಹಾಕಿತು?", "options": ["ಎಲೆಗಳು", "ಕಲ್ಲುಗಳು", "ಸಿಹಿತಿಂಡಿಗಳು", "ಮರಳು"], "answer": "ಕಲ್ಲುಗಳು"}},
                "uz": {"title": "Chanqagan qarg'a", "body": "Chanqagan qarg'a ozgina suvi bor ko'zani topdi. U birin-ketin mayda toshchalarni ko'zaga tashladi. Suv ko'tarildi va u xursand bo'lib suv ichdi.", "exercise": {"type": "quiz", "question": "Qarg'a ko'zaga nima tashladi?", "options": ["Barglar", "Toshchalar", "Qum", "Meva"], "answer": "Toshchalar"}}
            }
        ]
        
        for l in lessons_data:
            # Insert base lesson
            curr_id = curr_map[(l["difficulty"], l["category"])]
            lesson_id = await conn.fetchval("""
                INSERT INTO lessons (curriculum_id, title_key)
                VALUES ($1, $2)
                RETURNING lesson_id;
            """, curr_id, l["title_key"])
            
            # Insert translations
            for lang_code in ["en", "hi", "kn", "uz"]:
                lang_data = l[lang_code]
                await conn.execute("""
                    INSERT INTO lesson_content (lesson_id, language_code, translated_title, body_text, exercise_data)
                    VALUES ($1, $2, $3, $4, $5);
                """, lesson_id, lang_code, lang_data["title"], lang_data["body"], json.dumps(lang_data["exercise"]))
                
            print(f"Inserted Lesson '{l['title_key']}' for EN, HI, KN, UZ (ID: {lesson_id})")

        # 3. Insert Assessments for en, hi, kn
        # Each language needs Reading (STT Check), Comprehension (MCQ), Writing (STT/Text writing)
        assessments_data = [
            # ENGLISH
            {
                "type": "reading", "lang": "en",
                "passage": "A red bird sits on a green tree branch. The bird sings a sweet song.",
                "questions": [
                    {"id": "en_r1", "question": "Read this sentence aloud: 'A red bird sits on a green tree branch.'", "options": [], "answer": "A red bird sits on a green tree branch."}
                ]
            },
            {
                "type": "comprehension", "lang": "en",
                "passage": "Raj studied hard every night after finishing his farm work. Today, he received his results and found out he passed his primary language literacy exam with high marks. His family celebrated with sweets.",
                "questions": [
                    {"id": "en_c1", "question": "Why did Raj's family celebrate?", "options": ["He bought a farm", "He passed his literacy exam", "He went on a trip", "He bought sweets"], "answer": "He passed his literacy exam"}
                ]
            },
            {
                "type": "writing", "lang": "en",
                "passage": "Write a sentence describing what you want to learn.",
                "questions": [
                    {"id": "en_w1", "question": "Describe your learning goals in at least 5 words.", "options": [], "min_words": 5}
                ]
            },
            
            # HINDI
            {
                "type": "reading", "lang": "hi",
                "passage": "एक छोटी लाल चिड़िया हरी डाल पर बैठकर मीठा गाना गाती है।",
                "questions": [
                    {"id": "hi_r1", "question": "इस वाक्य को जोर से पढ़ें: 'एक छोटी लाल चिड़िया हरी डाल पर बैठकर मीठा गाना गाती है।'", "options": [], "answer": "एक छोटी लाल चिड़िया हरी डाल पर बैठकर मीठा गाना गाती है"}
                ]
            },
            {
                "type": "comprehension", "lang": "hi",
                "passage": "राजू ने रात में अपनी खेती का काम खत्म करने के बाद पढ़ाई की। आज उसने अपनी परीक्षा उत्तीर्ण कर ली। उसके परिवार ने मिठाइयाँ बाँटकर खुशी मनाई।",
                "questions": [
                    {"id": "hi_c1", "question": "राजू के परिवार ने जश्न क्यों मनाया?", "options": ["वह शहर गया", "उसने परीक्षा पास कर ली", "वह सो गया", "उसने एक नई गाय खरीदी"], "answer": "उसने परीक्षा पास कर ली"}
                ]
            },
            {
                "type": "writing", "lang": "hi",
                "passage": "अपने सीखने के लक्ष्य के बारे में एक वाक्य लिखें।",
                "questions": [
                    {"id": "hi_w1", "question": "कम से कम 4 शब्दों में लिखें कि आप क्या सीखना चाहते हैं।", "options": [], "min_words": 4}
                ]
            },

            # KANNADA
            {
                "type": "reading", "lang": "kn",
                "passage": "ಒಂದು ಸಣ್ಣ ಕೆಂಪು ಹಕ್ಕಿ ಹಸಿರು ಕೊಂಬೆಯ ಮೇಲೆ ಕುಳಿತು ಸಿಹಿ ಹಾಡನ್ನು ಹಾಡುತ್ತಿದೆ.",
                "questions": [
                    {"id": "kn_r1", "question": "ಈ ವಾಕ್ಯವನ್ನು ಗಟ್ಟಿಯಾಗಿ ಓದಿ: 'ಒಂದು ಸಣ್ಣ ಕೆಂಪು ಹಕ್ಕಿ ಹಸಿರು ಕೊಂಬೆಯ ಮೇಲೆ ಕುಳಿತು ಸಿಹಿ ಹಾಡನ್ನು ಹಾಡುತ್ತಿದೆ.'", "options": [], "answer": "ಒಂದು ಸಣ್ಣ ಕೆಂಪು ಹಕ್ಕಿ ಹಸಿರು ಕೊಂಬೆಯ ಮೇಲೆ ಕುಳಿತು ಸಿಹಿ ಹಾಡನ್ನು ಹಾಡುತ್ತಿದೆ"}
                ]
            },
            {
                "type": "comprehension", "lang": "kn",
                "passage": "ರಾಜು ಗದ್ದೆಯ ಕೆಲಸ ಮುಗಿಸಿದ ನಂತರ ಪ್ರತಿ ರಾತ್ರಿ ಶ್ರದ್ಧೆಯಿಂದ ಓದುತ್ತಿದ್ದನು. ಇಂದು ಅವನು ಪರೀಕ್ಷೆಯಲ್ಲಿ ತೇರ್ಗಡೆಯಾದನು. ಅವನ ಕುಟುಂಬವು ಸಿಹಿ ಹಂಚಿ ಸಂಭ್ರಮಿಸಿತು.",
                "questions": [
                    {"id": "kn_c1", "question": "ರಾಜು ಅವರ ಕುಟುಂಬ ಯಾಕೆ ಸಂಭ್ರಮಿಸಿತು?", "options": ["ಅವನು ಗದ್ದೆ ಖರೀದಿಸಿದ", "ಅವನು ಪರೀಕ್ಷೆಯಲ್ಲಿ ತೇರ್ಗಡೆಯಾದ", "ಅವನು ಊರಿಗೆ ಹೋದ", "ಅವನು ಹಸು ಖರೀದಿಸಿದ"], "answer": "ಅವನು ಪರೀಕ್ಷೆಯಲ್ಲಿ ತೇರ್ಗಡೆಯಾದ"}
                ]
            },
            {
                "type": "writing", "lang": "kn",
                "passage": "ನೀವು ಏನನ್ನು ಕಲಿಯಲು ಬಯಸುತ್ತೀರಿ ಎಂದು ಒಂದು ವಾಕ್ಯದಲ್ಲಿ ಬರೆಯಿರಿ.",
                "questions": [
                    {"id": "kn_w1", "question": "ಕನಿಷ್ಠ 4 ಪದಗಳಲ್ಲಿ ನಿಮ್ಮ ಕಲಿಕೆಯ ಗುರಿಯನ್ನು ಬರೆಯಿರಿ.", "options": [], "min_words": 4}
                ]
            },

            # UZBEK
            {
                "type": "reading", "lang": "uz",
                "passage": "Kichkina qizil qush yashil daraxt shoxida o'tirib yoqimli qo'shiq kuylamoqda.",
                "questions": [
                    {"id": "uz_r1", "question": "Ushbu gapni ovoz chiqarib o'qing: 'Kichkina qizil qush yashil daraxt shoxida o'tirib yoqimli qo'shiq kuylamoqda.'", "options": [], "answer": "Kichkina qizil qush yashil daraxt shoxida o'tirib yoqimli qo'shiq kuylamoqda"}
                ]
            },
            {
                "type": "comprehension", "lang": "uz",
                "passage": "Raju har kuni kechqurun dala ishlarini tugatgandan so'ng dars qildi. Bugun u o'zining savodxonlik imtihonini a'lo baholar bilan topshirdi. Uning oilasi buni xursandchilik bilan nishonladi.",
                "questions": [
                    {"id": "uz_c1", "question": "Rajuning oilasi nima sababdan bayram qildi?", "options": ["U yangi yer sotib oldi", "U savodxonlik imtihonini topshirdi", "U sayohatga ketdi", "U dam oldi"], "answer": "U savodxonlik imtihonini topshirdi"}
                ]
            },
            {
                "type": "writing", "lang": "uz",
                "passage": "O'rganish maqsadingiz haqida kamida bitta gap yozing.",
                "questions": [
                    {"id": "uz_w1", "question": "Kamida 4 ta so'zdan iborat o'rganish maqsadingizni yozing.", "options": [], "min_words": 4}
                ]
            }
        ]
        
        for a in assessments_data:
            await conn.execute("""
                INSERT INTO assessments (assessment_type, language_code, passage_text, question_data)
                VALUES ($1, $2, $3, $4);
            """, a["type"], a["lang"], a["passage"], json.dumps(a["questions"]))
            print(f"Inserted Assessment: Type={a['type']}, Lang={a['lang']}")
            
        print("Database seeded successfully!")
        await conn.close()
    except Exception as e:
        print(f"Error seeding database: {e}")

if __name__ == "__main__":
    asyncio.run(main())
