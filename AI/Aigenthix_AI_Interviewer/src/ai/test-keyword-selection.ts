import { searchQuestionsByKeywords } from './question-reference';

// Test the keyword-based question selection
function testKeywordSelection() {
  console.log('Testing keyword-based question selection...');
  
  // Test with some keywords
  const keywords = ['JavaScript', 'React', 'Frontend', 'Developer'];
  const relevantQuestions = searchQuestionsByKeywords(keywords);
  
  console.log(`Found ${relevantQuestions.length} relevant questions for keywords: ${keywords.join(', ')}`);
  
  // Show some of the relevant questions
  relevantQuestions.slice(0, 3).forEach((q, index) => {
    console.log(`${index + 1}. ${q.question} (Category: ${q.category}, Subcategory: ${q.subcategory})`);
  });
  
  // Test with different keywords
  const techKeywords = ['Technical', 'Programming', 'Computer Science'];
  const techQuestions = searchQuestionsByKeywords(techKeywords);
  
  console.log(`\nFound ${techQuestions.length} technical questions for keywords: ${techKeywords.join(', ')}`);
  
  // Show some of the technical questions
  techQuestions.slice(0, 3).forEach((q, index) => {
    console.log(`${index + 1}. ${q.question} (Category: ${q.category}, Subcategory: ${q.subcategory})`);
  });
  
  return {
    relevantQuestions: relevantQuestions.length,
    techQuestions: techQuestions.length
  };
}

testKeywordSelection();
