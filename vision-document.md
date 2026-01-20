# Exam Language Trainer Vision

## Introduction
I want to create a web application that lecturers can use to help foreign students who are studying in their non-native language.
This will be a great help for lecturers and students 
This will help lecturers identify who is struggling with the language and can provide aditional support struggling/anxious students feel more prepared as they take their exam
This will be achieved by creating a web-based application that extracts unusual/difficult words and generate a multiple choice quiz based on those words to test their vocabulary knowledge. This obviously should not include words that reveal too much information about the exam i.e protein names appearing on a biology exam and context should be kept in mind i.e a software development student should know what algorithm is 
This goal should be achievable without compromising exam integrity and security should be a main concern.
In a heavily globalized world I believe this will help more students be more confident and do better on their exams. As a foreign student myself, I genuinely believe this product could have helped me a number of times.

## Business Case Summary 
The problem is international students taking exams in a non-native language can mask their actual subject knowledge and some might fail not due to not knowing the material but because they are struggling with understanding specific vocabulary, and this creates feelings of unfairness and anxiety in some students.
And this matters even more today as universities around the world are becoming more and more internationalized, as more students have the chance to go study abroad with myself being a prime example.
The ones who care about these the most should be the universities themselves as they should provide a fair assessment for everyone, as exam integrity is one of the main concerns. 
And this proposition has good value because it helps students each begin at the same understanding of the language, reduces student anxiety and maintains exam security all at a low cost 

## Stakeholders
The stakeholder of this product are the lecturers and the foreign students.
The lecturer's goals are to make sure that all students that all students are at least at the same starting point, understanding the language before the subject of the course.
This should matter to a lecturer because they cannot evaluate the level of a certain course if they are not super if what the students dont understand is the course matter or the actual language itself.
The foreign students goals are to not only learn a new language but also learn a potential difficult subject in that new language. As a student, it is their responsibility to prepare for an exam adequately, but as a foreign student that can be harder with the existence of words that maybe they have not seen before and are not familiar with despite their language level and with a simple remainder before an exam, it can help certain students improve their results.

## Software Overview
The system will be made of three parts. 
- Client side tool which runs in the lecturers browser, processes the exam documents and generates the quiz locally 
- Storage/cloud application that stores the approved quizez
- Web based student interface where the students can access and take quizzes.

This three part system will essential for exam security as the lecturer will never upload the document to the internet where someone could access it.
It should be a simple tool to use for both lecturers and students.
The lecturers would load the exam, after which the browser runs processes the exam by extracting a number of difficult words and then generates a vocabulary quiz after which the lecturer approves the quiz and uploads it to a server.
The student will be given the quiz a few days in advance to help them prepare.

## Main Risk summary 

### Business risks
One of the main business risk would be if the students and/or the lecturers are open to this idea while the other would be the already established competitors in the market
### Technological risks
- can the processing be done in the lecturers browser?
- can any kind of files be processed in the browser? can it be done?
- what defines a hard word?
### Project risks
- time constraints, 15 weeks may not be enough time to build a whole system
- technical constrains, learning about language processing as the project progresses