// CLF-C02 exam structure. Task statements are verbatim from the official exam
// guide (as mirrored in CloudCertPrep's certifications.ts).
// https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html

export const EXAM = { name: 'AWS Certified Cloud Practitioner', code: 'CLF-C02', questions: 65, minutes: 90, passingScore: 700 }

export const DOMAINS = [
  { id: 1, name: 'Cloud Concepts', weight: 24 },
  { id: 2, name: 'Security and Compliance', weight: 30 },
  { id: 3, name: 'Cloud Technology and Services', weight: 34 },
  { id: 4, name: 'Billing, Pricing, and Support', weight: 12 },
]

export const TASKS = [
  { id: '1.1', domainId: 1, name: 'Define the benefits of the AWS Cloud' },
  { id: '1.2', domainId: 1, name: 'Identify design principles of the AWS Cloud' },
  { id: '1.3', domainId: 1, name: 'Understand the benefits of and strategies for migration to the AWS Cloud' },
  { id: '1.4', domainId: 1, name: 'Understand concepts of cloud economics' },
  { id: '2.1', domainId: 2, name: 'Understand the AWS shared responsibility model' },
  { id: '2.2', domainId: 2, name: 'Understand AWS Cloud security, governance, and compliance concepts' },
  { id: '2.3', domainId: 2, name: 'Identify AWS access management capabilities' },
  { id: '2.4', domainId: 2, name: 'Identify components and resources for security' },
  { id: '3.1', domainId: 3, name: 'Define methods of deploying and operating in the AWS Cloud' },
  { id: '3.2', domainId: 3, name: 'Define the AWS global infrastructure' },
  { id: '3.3', domainId: 3, name: 'Identify AWS compute services' },
  { id: '3.4', domainId: 3, name: 'Identify AWS database services' },
  { id: '3.5', domainId: 3, name: 'Identify AWS network services' },
  { id: '3.6', domainId: 3, name: 'Identify AWS storage services' },
  { id: '3.7', domainId: 3, name: 'Identify AWS artificial intelligence and machine learning (AI/ML) services and analytics services' },
  { id: '3.8', domainId: 3, name: 'Identify services from other in-scope AWS service categories' },
  { id: '4.1', domainId: 4, name: 'Compare AWS pricing models' },
  { id: '4.2', domainId: 4, name: 'Understand resources for billing, budget, and cost management' },
  { id: '4.3', domainId: 4, name: 'Identify AWS technical resources and AWS Support options' },
]
