export type SecurityWebsiteLocale = 'en' | 'si' | 'ta';

export const SECURITY_WEBSITE_LOCALES: SecurityWebsiteLocale[] = ['en', 'si', 'ta'];

export const LOCALE_LABELS: Record<SecurityWebsiteLocale, string> = {
  en: 'English',
  si: 'සිංහල',
  ta: 'தமிழ்',
};

export type SecurityWebsiteUiStrings = {
  navHome: string;
  navSolutions: string;
  navServices: string;
  navIndustries: string;
  navTechnology: string;
  navCompliance: string;
  navPricing: string;
  navQuote: string;
  navContact: string;
  navMore: string;
  navClientPortal: string;
  clientPortalSignIn: string;
  clientPortalHint: string;
  clientPortalEmail: string;
  clientPortalPassword: string;
  clientPortalNoAccess: string;
  ctaEstimate: string;
  ctaCareers: string;
  getEstimate: string;
  requestAssessment: string;
  callNow: string;
  whatsappUs: string;
  indicativeEstimate: string;
  customRequest: string;
  quoteRequestSummary: string;
  bookAssessment: string;
  emailEstimate: string;
  serviceType: string;
  location: string;
  guardsPerShift: string;
  guardRanksPerShift: string;
  guardRanksMobileHint: string;
  guardRanksMobileTapToEdit: string;
  guardRanksMobileEmpty: string;
  totalGuardsPerShift: string;
  shiftCoverage: string;
  shiftDayOnly: string;
  shiftNightOnly: string;
  shiftBoth: string;
  hoursPerShift: string;
  contractLength: string;
  armedRequired: string;
  supervisorIncluded: string;
  monthlyEstimate: string;
  estimateDisclaimer: string;
  static: string;
  patrol: string;
  corporate: string;
  event: string;
  colombo: string;
  greaterColombo: string;
  otherDistrict: string;
  hours8: string;
  hours12: string;
  hours24: string;
  months1: string;
  months6: string;
  months12: string;
  yes: string;
  no: string;
  trustSira: string;
  trustInsured: string;
  trustReplacement: string;
  trustReplacementDetail: string;
  trustTraining: string;
  trustTrainingDetail: string;
  submitQuote: string;
  quoteSuccess: string;
  yourName: string;
  companyName: string;
  siteDistrict: string;
  startDate: string;
  additionalNotes: string;
  careersEyebrow: string;
  careersTitle: string;
  careersNoVacanciesTitle: string;
  careersNoVacanciesBody: string;
  careersRanksNeeded: string;
  careersApply: string;
  careersModalApply: string;
  careersPhonePrimary: string;
  careersPhoneSecondary: string;
  careersPhonePlaceholder: string;
  careersPhoneOptional: string;
  careersWeightKg: string;
  careersHeightFt: string;
  careersHeightPlaceholder: string;
  careersIdentityDocs: string;
  careersNicFront: string;
  careersNicBack: string;
  careersServicemenCert: string;
  careersTapUpload: string;
  careersLiveSelfie: string;
  careersOpenCamera: string;
  careersCaptureSelfie: string;
  careersRetakeSelfie: string;
  careersSubmit: string;
  careersSubmitting: string;
  careersSubmittedTitle: string;
  careersSubmittedBody: string;
  careersDone: string;
  careersClose: string;
  careersLanguage: string;
  careersLocationPending: string;
  careersErrCamera: string;
  careersErrDocs: string;
  careersErrSelfie: string;
  careersErrSubmit: string;
  careersErrImage: string;
};

const EN: SecurityWebsiteUiStrings = {
  navHome: 'Home',
  navSolutions: 'What we offer',
  navServices: 'Services',
  navIndustries: 'Industries',
  navTechnology: 'Platform',
  navCompliance: 'Compliance',
  navPricing: 'Pricing',
  navQuote: 'Get a quote',
  navContact: 'Contact',
  navMore: 'More',
  navClientPortal: 'Client Portal',
  clientPortalSignIn: 'Sign in to your site dashboard',
  clientPortalHint: 'Use the credentials issued by your account manager.',
  clientPortalEmail: 'Work email',
  clientPortalPassword: 'Password',
  clientPortalNoAccess: 'Need access? Contact us for a site assessment.',
  ctaEstimate: 'Estimate',
  ctaCareers: 'Careers',
  getEstimate: 'Get instant estimate',
  requestAssessment: 'Request site assessment',
  callNow: 'Call now',
  whatsappUs: 'WhatsApp us',
  indicativeEstimate: 'Request custom quote',
  customRequest: 'Your requirements',
  quoteRequestSummary:
    'Share your site details below. Our team will review your requirements and respond with a tailored quote.',
  bookAssessment: 'Book free assessment',
  emailEstimate: 'Email me this request',
  serviceType: 'Service type',
  location: 'Location',
  guardsPerShift: 'Guards per shift',
  guardRanksPerShift: 'Guard ranks per shift',
  guardRanksMobileHint: 'Select one or more ranks and set how many you need per shift.',
  guardRanksMobileTapToEdit: 'Tap to add or change ranks',
  guardRanksMobileEmpty: 'No ranks selected — tap to choose',
  totalGuardsPerShift: 'Total per shift',
  shiftCoverage: 'Shift coverage',
  shiftDayOnly: 'Day shift only',
  shiftNightOnly: 'Night shift only',
  shiftBoth: 'Day & night (both)',
  hoursPerShift: 'Hours per shift',
  contractLength: 'Contract length',
  armedRequired: 'Armed cover required',
  supervisorIncluded: 'Include supervisor',
  monthlyEstimate: 'Custom quote',
  estimateDisclaimer:
    'Tell us what you need — final pricing follows a free site assessment and risk review.',
  static: 'Security guards',
  patrol: 'Visiting officers and patrolling guards',
  corporate: 'Guest relations & facility officers',
  event: 'Special functions & bodyguards',
  colombo: 'Colombo city',
  greaterColombo: 'Greater Colombo',
  otherDistrict: 'Other district',
  hours8: '8 hours',
  hours12: '12 hours',
  hours24: '24 hours',
  months1: '1 month',
  months6: '6 months',
  months12: '12 months',
  yes: 'Yes',
  no: 'No',
  trustSira: 'Ministry licensed',
  trustInsured: 'Fully insured',
  trustReplacement: 'Visiting officers',
  trustReplacementDetail: '24/7 island-wide rapid response',
  trustTraining: 'Trained & vetted officers',
  trustTrainingDetail: 'Ministry-certified fire, first aid & drill',
  submitQuote: 'Submit request',
  quoteSuccess: 'Thank you — our operations team will contact you shortly.',
  yourName: 'Your name',
  companyName: 'Company / site name',
  siteDistrict: 'Site district',
  startDate: 'Preferred start date',
  additionalNotes: 'Additional notes',
  careersEyebrow: 'Join our team',
  careersTitle: 'Open vacancies',
  careersNoVacanciesTitle: 'No open vacancies right now',
  careersNoVacanciesBody:
    'Check back soon or send your details — we keep applications on file for the next opening.',
  careersRanksNeeded: 'Ranks needed',
  careersApply: 'Apply',
  careersModalApply: 'Apply',
  careersPhonePrimary: 'Phone number *',
  careersPhoneSecondary: 'Second phone',
  careersPhonePlaceholder: '07X XXX XXXX',
  careersPhoneOptional: 'Optional',
  careersWeightKg: 'Weight (kg) *',
  careersHeightFt: 'Height (ft) *',
  careersHeightPlaceholder: 'e.g. 5.8',
  careersIdentityDocs: 'Identity documents *',
  careersNicFront: 'NIC or passport',
  careersNicBack: 'NIC or passport — back',
  careersServicemenCert: 'Servicemen certificate',
  careersTapUpload: 'Tap to upload photo',
  careersLiveSelfie: 'Live selfie *',
  careersOpenCamera: 'Open camera for live selfie',
  careersCaptureSelfie: 'Capture selfie',
  careersRetakeSelfie: 'Retake selfie',
  careersSubmit: 'Submit application',
  careersSubmitting: 'Submitting…',
  careersSubmittedTitle: 'Application submitted',
  careersSubmittedBody:
    'Our operations team will review your documents and contact you on your primary phone number.',
  careersDone: 'Done',
  careersClose: 'Close',
  careersLanguage: 'Language',
  careersLocationPending: 'Location pending',
  careersErrCamera: 'Camera access is required for your live selfie.',
  careersErrDocs: 'Upload all required document photos.',
  careersErrSelfie: 'Take a live selfie before submitting.',
  careersErrSubmit: 'Submission failed. Please try again.',
  careersErrImage: 'Could not process that image.',
};

const SI: SecurityWebsiteUiStrings = {
  navHome: 'මුල් පිටුව',
  navSolutions: 'අප පිරිනමන දේ',
  navServices: 'සේවා',
  navIndustries: 'කර්මාන්ත',
  navTechnology: 'වේදිකාව',
  navCompliance: 'අනුකූලතාව',
  navPricing: 'මිල ගණන්',
  navQuote: 'ඇස්තමේන්තුවක්',
  navContact: 'සම්බන්ධ වන්න',
  navMore: 'තවත්',
  navClientPortal: 'සේවාලාභී දොරටුව',
  clientPortalSignIn: 'ඔබේ අඩවි උපකරණ පුවරුවට පිවිසෙන්න',
  clientPortalHint: 'ඔබේ ගිණුම් කළමනාකරු විසින් ලබා දුන් අක්තපත්‍ර භාවිතා කරන්න.',
  clientPortalEmail: 'වැඩ විද්‍යුත් තැපෑල',
  clientPortalPassword: 'මුරපදය',
  clientPortalNoAccess: 'ප්‍රවේශය අවශ්‍යද? අඩවි තක්සේරුවක් සඳහා අප හා සම්බන්ධ වන්න.',
  ctaEstimate: 'ඇස්තමේන්තුව',
  ctaCareers: 'රැකියා',
  getEstimate: 'ක්ෂණික ඇස්තමේන්තුව',
  requestAssessment: 'අඩවි තක්සේරුවක් ඉල්ලන්න',
  callNow: 'දැන් අමතන්න',
  whatsappUs: 'WhatsApp',
  indicativeEstimate: 'විශේෂ ඇස්තමේන්තුවක් ඉල්ලන්න',
  customRequest: 'ඔබේ අවශ්‍යතා',
  quoteRequestSummary:
    'ඔබේ අඩවි විස්තර පහත සඳහන් කරන්න. අපගේ කණ්ඩායම ඔබේ අවශ්‍යතා සමාලෝචනය කර විශේෂ ඇස්තමේන්තුවක් ලබා දෙන්නෙමු.',
  bookAssessment: 'නොමිලේ තක්සේරුවක්',
  emailEstimate: 'මට මෙම ඉල්ලීම ඊමේල් කරන්න',
  serviceType: 'සේවා වර්ගය',
  location: 'ස්ථානය',
  guardsPerShift: 'වැඩ මුරකරුවන් (වැඩ මුරය)',
  guardRanksPerShift: 'වැඩ මුර ශ්‍රේණි (වැඩ මුරය)',
  guardRanksMobileHint:
    'එක් හෝ වැඩි ශ්‍රේණි තෝරා, වැඩ මුරයකට අවශ්‍ය සංඛ්‍යාව සකසන්න.',
  guardRanksMobileTapToEdit: 'ශ්‍රේණි එකතු/වෙනස් කිරීමට තට්ටු කරන්න',
  guardRanksMobileEmpty: 'ශ්‍රේණි තෝරා නැත — තෝරා ගැනීමට තට්ටු කරන්න',
  totalGuardsPerShift: 'මුළු සංඛ්‍යාව',
  shiftCoverage: 'වැඩ මුර ආවරණය',
  shiftDayOnly: 'දිවා වැඩ මුරය පමණි',
  shiftNightOnly: 'රාත්‍රී වැඩ මුරය පමණි',
  shiftBoth: 'දිවා සහ රාත්‍රී (දෙකම)',
  hoursPerShift: 'වැඩ මුරයක පැය',
  contractLength: 'ගිවිසුම් කාලය',
  armedRequired: 'ආයුධ සහිත ආරක්ෂාව',
  supervisorIncluded: 'අධීක්ෂක ඇතුළත්',
  monthlyEstimate: 'විශේෂ ඇස්තමේන්තුව',
  estimateDisclaimer:
    'ඔබට අවශ්‍ය දේ අපට දන්වන්න — අවසාන මිල නොමිලේ අඩවි තක්සේරුවෙන් පසු තීරණය වේ.',
  static: 'ස්ථිර & දොරටු',
  patrol: 'චලන මුර',
  corporate: 'ආයතනික',
  event: 'උත්සව & තාවකාලික',
  colombo: 'කොළඹ නගරය',
  greaterColombo: 'විශාල කොළඹ',
  otherDistrict: 'වෙනත් දිස්ත්‍රික්කය',
  hours8: 'පැය 8',
  hours12: 'පැය 12',
  hours24: 'පැය 24',
  months1: 'මාස 1',
  months6: 'මාස 6',
  months12: 'මාස 12',
  yes: 'ඔව්',
  no: 'නැත',
  trustSira: 'ආරක්ෂක අමාත්‍යාංශ බලපත්‍ර',
  trustInsured: 'රක්ෂණ සහිත',
  trustReplacement: 'සංචාරක නිලධාරීන්',
  trustReplacementDetail: '24/7 දිවයින පුරා හදිසි ප්‍රතිචාර',
  trustTraining: 'පුහුණු & සත්‍යාපිත නිලධාරීන්',
  trustTrainingDetail: 'ආරක්ෂක අමාත්‍යාංශ — ගිනි, ප්‍රථමාධාර & ක්‍රම පුහුණ',
  submitQuote: 'ඉල්ලීම යවන්න',
  quoteSuccess: 'ස්තූතියි — අපගේ ක්‍රියාකාරී කණ්ඩායම ඉක්මනින් සම්බන්ධ වේ.',
  yourName: 'ඔබේ නම',
  companyName: 'ආයතන / අඩවි නම',
  siteDistrict: 'අඩවි දිස්ත්‍රික්කය',
  startDate: 'ආරම්භක දිනය',
  additionalNotes: 'අමතර සටහන්',
  careersEyebrow: 'අපගේ කණ්ඩායමට සම්බන්ධ වන්න',
  careersTitle: 'විවෘත රැකියා අවස්ථා',
  careersNoVacanciesTitle: 'දැනට විවෘත රැකියා අවස්ථා නැත',
  careersNoVacanciesBody:
    'ඉක්මනින් නැවත පරීක්ෂා කරන්න — අපි ඔබේ විස්තර ඊළඟ අවස්ථාව සඳහා තබා ගනිමු.',
  careersRanksNeeded: 'අවශ්‍ය ශ්‍රේණි',
  careersApply: 'අයදුම් කරන්න',
  careersModalApply: 'අයදුම් කරන්න',
  careersPhonePrimary: 'දුරකථන අංකය *',
  careersPhoneSecondary: 'දෙවන දුරකථන අංකය',
  careersPhonePlaceholder: '07X XXX XXXX',
  careersPhoneOptional: 'අනිවාර්ය නොවේ',
  careersWeightKg: 'බර (කි.ග්‍රෑ.) *',
  careersHeightFt: 'උස (අඩි) *',
  careersHeightPlaceholder: 'උදා. 5.8',
  careersIdentityDocs: 'හැඳුනුම් ලේඛන *',
  careersNicFront: 'ජා.හැ.ඇ. / පාස්පෝර්ට්',
  careersNicBack: 'ජා.හැ.ඇ./පාස්පෝර්ට් — පිටුපස',
  careersServicemenCert: 'සේවා සම්පූර්ණ සහතිකය',
  careersTapUpload: 'ඡායාරූපය උඩුගත කිරීමට තට්ටු කරන්න',
  careersLiveSelfie: 'සජීව සෙල්ෆි *',
  careersOpenCamera: 'සජීව සෙල්ෆි සඳහා කැමරාව විවෘත කරන්න',
  careersCaptureSelfie: 'සෙල්ෆි ගන්න',
  careersRetakeSelfie: 'නැවත සෙල්ෆි ගන්න',
  careersSubmit: 'අයදුම්පත යවන්න',
  careersSubmitting: 'යවමින්…',
  careersSubmittedTitle: 'අයදුම්පත යැවිණි',
  careersSubmittedBody:
    'අපගේ මෙහෙයුම් කණ්ඩායම ඔබේ ලේඛන සමාලෝචනය කර ප්‍රධාන දුරකථන අංකයට සම්බන්ධ වේ.',
  careersDone: 'අවසන්',
  careersClose: 'වසන්න',
  careersLanguage: 'භාෂාව',
  careersLocationPending: 'ස්ථානය තහවුරු කරමින්',
  careersErrCamera: 'සජීව සෙල්ෆි සඳහා කැමරා ප්‍රවේශය අවශ්‍යයි.',
  careersErrDocs: 'අවශ්‍ය සියලු ලේඛන ඡායාරූප උඩුගත කරන්න.',
  careersErrSelfie: 'යැවීමට පෙර සජීව සෙල්ෆි ගන්න.',
  careersErrSubmit: 'යැවීම අසාර්ථක විය. නැවත උත්සාහ කරන්න.',
  careersErrImage: 'ඡායාරූපය සැකසිය නොහැකි විය.',
};

const TA: SecurityWebsiteUiStrings = {
  navHome: 'முகப்பு',
  navSolutions: 'நாங்கள் வழங்குவது',
  navServices: 'சேவைகள்',
  navIndustries: 'துறைகள்',
  navTechnology: 'தளம்',
  navCompliance: 'இணக்கம்',
  navPricing: 'விலை',
  navQuote: 'மதிப்பீடு',
  navContact: 'தொடர்பு',
  navMore: 'மேலும்',
  navClientPortal: 'வாடிக்கையாளர் போர்டல்',
  clientPortalSignIn: 'உங்கள் தள டாஷ்போர்டில் உள்நுழையுங்கள்',
  clientPortalHint: 'உங்கள் கணக்கு மேலாளர் வழங்கிய அங்கீகாரங்களைப் பயன்படுத்துங்கள்.',
  clientPortalEmail: 'வேலை மின்னஞ்சல்',
  clientPortalPassword: 'கடவுச்சொல்',
  clientPortalNoAccess: 'அணுகல் தேவையா? தள மதிப்பீட்டுக்கு எங்களை தொடர்பு கொள்ளுங்கள்.',
  ctaEstimate: 'மதிப்பீடு',
  ctaCareers: 'வேலைவாய்ப்பு',
  getEstimate: 'உடனடி மதிப்பீடு',
  requestAssessment: 'தள மதிப்பீடு கோருங்கள்',
  callNow: 'இப்போது அழைக்கவும்',
  whatsappUs: 'WhatsApp',
  indicativeEstimate: 'தனிப்பயன் மதிப்பீட்டைக் கோருங்கள்',
  customRequest: 'உங்கள் தேவைகள்',
  quoteRequestSummary:
    'உங்கள் தள விவரங்களை கீழே பகிருங்கள். எங்கள் குழு உங்கள் தேவைகளை மதிப்பாய்வு செய்து தனிப்பயன் மதிப்பீட்டை வழங்குவோம்.',
  bookAssessment: 'இலவச மதிப்பீடு',
  emailEstimate: 'இந்த கோரிக்கையை மின்னஞ்சல் செய்யுங்கள்',
  serviceType: 'சேவை வகை',
  location: 'இடம்',
  guardsPerShift: 'ஒரு ஷிப்டுக்கு காவலர்கள்',
  guardRanksPerShift: 'ஷிப்டுக்கு காவலர் தரங்கள்',
  guardRanksMobileHint:
    'ஒன்று அல்லது அதற்கு மேற்பட்ட தரங்களைத் தேர்ந்தெடுத்து, ஒரு ஷிப்டுக்கு எத்தனை தேவை என்பதை அமைக்கவும்.',
  guardRanksMobileTapToEdit: 'தரங்களைச் சேர்க்க/மாற்ற தட்டவும்',
  guardRanksMobileEmpty: 'தரங்கள் தேர்ந்தெடுக்கப்படவில்லை — தேர்வு செய்ய தட்டவும்',
  totalGuardsPerShift: 'மொத்த எண்ணிக்கை',
  shiftCoverage: 'ஷிப்ட் கவரேஜ்',
  shiftDayOnly: 'பகல் ஷிப்ட் மட்டும்',
  shiftNightOnly: 'இரவு ஷிப்ட் மட்டும்',
  shiftBoth: 'பகல் & இரவு (இரண்டும்)',
  hoursPerShift: 'ஷிப்ட் மணிநேரம்',
  contractLength: 'ஒப்பந்த காலம்',
  armedRequired: 'ஆயுத காவல் தேவை',
  supervisorIncluded: 'மேற்பார்வையாளர் சேர்க்க',
  monthlyEstimate: 'தனிப்பயன் மதிப்பீடு',
  estimateDisclaimer:
    'உங்களுக்கு என்ன தேவை என்று சொல்லுங்கள் — இறுதி விலை இலவச தள மதிப்பீட்டிற்குப் பிறகு தீர்மானிக்கப்படும்.',
  static: 'நிலையான & வாயில்',
  patrol: 'இயங்கும் ரோந்து',
  corporate: 'நிறுவன & வசதி',
  event: 'நிகழ்வு & தற்காலிக',
  colombo: 'கொழும்பு நகரம்',
  greaterColombo: 'பரந்த கொழும்பு',
  otherDistrict: 'பிற மாவட்டம்',
  hours8: '8 மணி',
  hours12: '12 மணி',
  hours24: '24 மணி',
  months1: '1 மாதம்',
  months6: '6 மாதங்கள்',
  months12: '12 மாதங்கள்',
  yes: 'ஆம்',
  no: 'இல்லை',
  trustSira: 'பாதுகாப்பு அமைச்சு உரிமம்',
  trustInsured: 'காப்பீடு உள்ளது',
  trustReplacement: 'வருகை அதிகாரிகள்',
  trustReplacementDetail: '24/7 தீவு முழுவதும் அவசர பதில்',
  trustTraining: 'பயிற்சி & சரிபார்க்கப்பட்ட அதிகாரிகள்',
  trustTrainingDetail: 'பாதுகாப்பு அமைச்சு — தீ, முதலுதவி & parade',
  submitQuote: 'கோரிக்கை அனுப்பு',
  quoteSuccess: 'நன்றி — எங்கள் செயல்பாட்டு குழு விரைவில் தொடர்பு கொள்ளும்.',
  yourName: 'உங்கள் பெயர்',
  companyName: 'நிறுவன / தள பெயர்',
  siteDistrict: 'தள மாவட்டம்',
  startDate: 'தொடக்க தேதி',
  additionalNotes: 'கூடுதல் குறிப்புகள்',
  careersEyebrow: 'எங்கள் குழுவில் சேருங்கள்',
  careersTitle: 'திறந்த வேலைவாய்ப்புகள்',
  careersNoVacanciesTitle: 'தற்போது திறந்த வேலைவாய்ப்புகள் இல்லை',
  careersNoVacanciesBody:
    'விரைவில் மீண்டும் பாருங்கள் — அடுத்த வாய்ப்புக்காக உங்கள் விவரங்களை வைத்திருப்போம்.',
  careersRanksNeeded: 'தேவையான தரங்கள்',
  careersApply: 'விண்ணப்பிக்க',
  careersModalApply: 'விண்ணப்பிக்க',
  careersPhonePrimary: 'தொலைபேசி எண் *',
  careersPhoneSecondary: 'இரண்டாவது தொலைபேசி',
  careersPhonePlaceholder: '07X XXX XXXX',
  careersPhoneOptional: 'விருப்பம்',
  careersWeightKg: 'எடை (கி.கி) *',
  careersHeightFt: 'உயரம் (அடி) *',
  careersHeightPlaceholder: 'எ.கா. 5.8',
  careersIdentityDocs: 'அடையாள ஆவணங்கள் *',
  careersNicFront: 'தே.அ.அ / பாஸ்போர்ட்',
  careersNicBack: 'தே.அ.அ / பாஸ்போர்ட் — பின்',
  careersServicemenCert: 'படைவீரர் சான்றிதழ்',
  careersTapUpload: 'புகைப்படம் பதிவேற்ற தட்டவும்',
  careersLiveSelfie: 'நேரடி செல்ஃபி *',
  careersOpenCamera: 'நேரடி செல்ஃபிக்கு கேமராவைத் திறக்கவும்',
  careersCaptureSelfie: 'செல்ஃபி எடுக்க',
  careersRetakeSelfie: 'மீண்டும் செல்ஃபி எடுக்க',
  careersSubmit: 'விண்ணப்பத்தை அனுப்பு',
  careersSubmitting: 'அனுப்புகிறது…',
  careersSubmittedTitle: 'விண்ணப்பம் அனுப்பப்பட்டது',
  careersSubmittedBody:
    'எங்கள் செயல்பாட்டுக் குழு உங்கள் ஆவணங்களை மதிப்பாய்வு செய்து முதன்மை தொலைபேசி எண்ணில் தொடர்பு கொள்ளும்.',
  careersDone: 'முடிந்தது',
  careersClose: 'மூடு',
  careersLanguage: 'மொழி',
  careersLocationPending: 'இடம் உறுதிப்படுத்தப்படுகிறது',
  careersErrCamera: 'நேரடி செல்ஃபிக்கு கேமரா அணுகல் தேவை.',
  careersErrDocs: 'தேவையான அனைத்து ஆவண புகைப்படங்களையும் பதிவேற்றவும்.',
  careersErrSelfie: 'அனுப்புவதற்கு முன் நேரடி செல்ஃபி எடுக்கவும்.',
  careersErrSubmit: 'அனுப்புதல் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
  careersErrImage: 'படத்தை செயலாக்க முடியவில்லை.',
};

export const SECURITY_WEBSITE_UI: Record<SecurityWebsiteLocale, SecurityWebsiteUiStrings> = {
  en: EN,
  si: SI,
  ta: TA,
};

export function getSecurityWebsiteUi(locale: SecurityWebsiteLocale): SecurityWebsiteUiStrings {
  return SECURITY_WEBSITE_UI[locale] ?? EN;
}

export function parseLocale(value: string | undefined | null): SecurityWebsiteLocale {
  if (value === 'si' || value === 'ta') return value;
  return 'en';
}

export const SECURITY_WEBSITE_LOCALE_STORAGE_KEY = 'security-website-locale';
/** Careers page only — separate from site chrome; defaults to Sinhala. */
export const SECURITY_WEBSITE_CAREERS_LOCALE_STORAGE_KEY = 'security-website-careers-locale-v2';

export const CAREERS_DEFAULT_LOCALE: SecurityWebsiteLocale = 'si';

/** Careers language picker order — Sinhala first as the default choice. */
export const CAREERS_LOCALE_ORDER: SecurityWebsiteLocale[] = ['si', 'ta', 'en'];

export function resolveCareersLocale(
  storedLocale?: SecurityWebsiteLocale | null,
): SecurityWebsiteLocale {
  if (storedLocale) return storedLocale;
  return CAREERS_DEFAULT_LOCALE;
}

export function readStoredCareersLocale(): SecurityWebsiteLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(SECURITY_WEBSITE_CAREERS_LOCALE_STORAGE_KEY);
    if (!stored) return null;
    return parseLocale(stored);
  } catch {
    return null;
  }
}

export function readInitialCareersLocale(): SecurityWebsiteLocale {
  return resolveCareersLocale(readStoredCareersLocale());
}

export function persistCareersLocale(locale: SecurityWebsiteLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SECURITY_WEBSITE_CAREERS_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore private browsing / quota errors.
  }
}

export function detectBrowserLocale(): SecurityWebsiteLocale {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('si') || lang.startsWith('sin')) return 'si';
  if (lang.startsWith('ta') || lang.startsWith('tam')) return 'ta';
  return 'en';
}

export function readStoredSecurityWebsiteLocale(): SecurityWebsiteLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(SECURITY_WEBSITE_LOCALE_STORAGE_KEY);
    if (!stored) return null;
    return parseLocale(stored);
  } catch {
    return null;
  }
}

export function persistSecurityWebsiteLocale(locale: SecurityWebsiteLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SECURITY_WEBSITE_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore private browsing / quota errors.
  }
}

export function resolveSecurityWebsiteLocale(options?: {
  urlLocale?: string | null;
  storedLocale?: SecurityWebsiteLocale | null;
  fallbackLocale?: SecurityWebsiteLocale;
}): SecurityWebsiteLocale {
  if (options?.urlLocale) return parseLocale(options.urlLocale);
  if (options?.storedLocale) return options.storedLocale;
  if (options?.fallbackLocale) return options.fallbackLocale;
  return detectBrowserLocale();
}

export type LocalizedHero = {
  heroHeadline?: string;
  heroSubheadline?: string;
  heroCtaPrimary?: string;
  heroCtaSecondary?: string;
};

export type CareersSiteLabels = Partial<Record<SecurityWebsiteLocale, string>>;

export function pickLocalizedHero(
  content: {
    heroHeadline: string;
    heroSubheadline: string;
    heroCtaPrimary: string;
    heroCtaSecondary: string;
    i18n?: Partial<Record<SecurityWebsiteLocale, LocalizedHero>>;
  },
  locale: SecurityWebsiteLocale,
): LocalizedHero {
  const localized = content.i18n?.[locale];
  return {
    heroHeadline: localized?.heroHeadline || content.heroHeadline,
    heroSubheadline: localized?.heroSubheadline || content.heroSubheadline,
    heroCtaPrimary: localized?.heroCtaPrimary || content.heroCtaPrimary,
    heroCtaSecondary: localized?.heroCtaSecondary || content.heroCtaSecondary,
  };
}
