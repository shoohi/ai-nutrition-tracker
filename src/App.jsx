import React, { useState, useEffect, useMemo } from 'react';

// --- Helper Functions ---
const getTodayDateString = () => new Date().toISOString().split('T')[0];

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

const calculateGoalBasedHealthScore = (totals, goals) => {
    if (!goals || Object.keys(goals).length === 0) return 0;

    const metrics = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'];
    let totalScore = 0;
    let metricCount = 0;

    metrics.forEach(metric => {
        const totalValue = totals[metric] || 0;
        const goalValue = goals[metric] || 0;

        if (goalValue > 0) {
            metricCount++;
            const percentOfGoal = (totalValue / goalValue) * 100;
            let metricScore = 0;

            if (metric === 'calories' || metric === 'fat_g') {
                // Penalize going over for calories and fat
                if (percentOfGoal <= 100) {
                    metricScore = percentOfGoal; // Score increases as you approach 100%
                } else {
                    metricScore = Math.max(0, 100 - (percentOfGoal - 100) * 2); // Score drops twice as fast when over
                }
            } else { // Protein, Carbs, Fiber
                // Reward meeting or exceeding for protein and fiber
                metricScore = Math.min(100, percentOfGoal);
            }
            totalScore += metricScore;
        }
    });

    if (metricCount === 0) return 0;
    return Math.round(totalScore / metricCount);
};

// --- Main App Component ---
const App = () => {
    const [weeklyLog, setWeeklyLog] = useState({});
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const [goals, setGoals] = useState({ calories: 2000, protein_g: 100, carbs_g: 250, fat_g: 70, fiber_g: 30 });
    const [userProfile, setUserProfile] = useState({ age: 30, gender: 'male', height: 180, weight: 80, activityLevel: 'sedentary', fitnessGoal: 'maintain' });
    const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);

    // --- Load data from Local Storage on initial render ---
    useEffect(() => {
        try {
            // Load and clean weekly log
            const savedWeeklyLog = JSON.parse(localStorage.getItem('weeklyLog') || '{}');
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const cleanedLog = {};
            Object.keys(savedWeeklyLog).forEach(dateStr => {
                if (new Date(dateStr) >= sevenDaysAgo) {
                    cleanedLog[dateStr] = savedWeeklyLog[dateStr];
                }
            });
            setWeeklyLog(cleanedLog);
            localStorage.setItem('weeklyLog', JSON.stringify(cleanedLog));

            // Load goals and profile
            const savedGoals = localStorage.getItem('nutritionGoals');
            if (savedGoals) setGoals(JSON.parse(savedGoals));

            const savedProfile = localStorage.getItem('userProfile');
            if (savedProfile) setUserProfile(JSON.parse(savedProfile));

        } catch (e) {
            console.error("Failed to load data from local storage", e);
            setError({ title: "Load Error", message: "Could not load your saved data." });
        }
    }, []);

    const todaysLog = useMemo(() => weeklyLog[getTodayDateString()] || [], [weeklyLog]);

    const dailyTotals = useMemo(() => {
        return todaysLog.reduce((acc, item) => {
            acc.calories += item.calories || 0;
            acc.protein_g += item.protein_g || 0;
            acc.carbs_g += item.carbs_g || 0;
            acc.fat_g += item.fat_g || 0;
            acc.fiber_g += item.fiber_g || 0;
            return acc;
        }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
    }, [todaysLog]);

    const healthScore = useMemo(() => calculateGoalBasedHealthScore(dailyTotals, goals), [dailyTotals, goals]);

    const updateAndSaveWeeklyLog = (newTodaysLog) => {
        const today = getTodayDateString();
        const newWeeklyLog = {
            ...weeklyLog,
            [today]: newTodaysLog,
        };
        setWeeklyLog(newWeeklyLog);
        localStorage.setItem('weeklyLog', JSON.stringify(newWeeklyLog));
    };

    const handleSaveGoals = (newGoals) => {
        try {
            setGoals(newGoals);
            localStorage.setItem('nutritionGoals', JSON.stringify(newGoals));
            setIsGoalsModalOpen(false);
        } catch (e) {
            setError({ title: "Save Error", message: "Could not save goals." });
        }
    };

    const handleSaveProfile = (newProfile) => {
        try {
            setUserProfile(newProfile);
            localStorage.setItem('userProfile', JSON.stringify(newProfile));
        } catch (e) {
            setError({ title: "Save Error", message: "Could not save profile." });
        }
    };

    const handleEditStart = (item) => {
        setEditingItem(item);
        setUserInput(item.originalQuery);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEditCancel = () => {
        setEditingItem(null);
        setUserInput('');
    };

    const handleDelete = (itemIdToDelete) => {
        const newLog = todaysLog.filter(item => item.id !== itemIdToDelete);
        updateAndSaveWeeklyLog(newLog);
    };

    const getNutritionalInfo = async (foodDescription) => {
        const apiKey = "AIzaSyDBQU_V2reiqvz_pgY-BLpu4uDeHInlVss";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: `Analyze the following food item and provide its nutritional information: "${foodDescription}"` }] }],
            systemInstruction: { parts: [{ text: "You are a nutritional analysis expert. Respond ONLY with a JSON object." }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: { type: "OBJECT", properties: { food_name: { "type": "STRING" }, calories: { "type": "NUMBER" }, protein_g: { "type": "NUMBER" }, carbs_g: { "type": "NUMBER" }, fat_g: { "type": "NUMBER" }, fiber_g: { "type": "NUMBER" } }, required: ["food_name", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] }
            }
        };
        try {
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            const result = await response.json();
            if (result.candidates?.[0]?.content?.parts?.[0]?.text) { return JSON.parse(result.candidates[0].content.parts[0].text); }
            else { throw new Error("Invalid response from nutrition service."); }
        } catch (apiError) {
             console.error("API Call failed:", apiError);
             setError({ title: "AI Error", message: "Failed to analyze food. The AI service may be busy."});
             return null;
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;

        setIsLoading(true);
        setError(null);

        try {
            const nutritionalInfo = await getNutritionalInfo(userInput);
            if (!nutritionalInfo) {
                setIsLoading(false);
                return;
            }

            let newTodaysLog;
            if (editingItem) {
                const updatedItem = { ...editingItem, ...nutritionalInfo, originalQuery: userInput };
                newTodaysLog = todaysLog.map(item => item.id === editingItem.id ? updatedItem : item);
                handleEditCancel();
            } else {
                const newEntry = { ...nutritionalInfo, id: `${Date.now()}-${Math.random()}`, originalQuery: userInput, timestamp: new Date().toISOString() };
                newTodaysLog = [newEntry, ...todaysLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                setUserInput('');
            }

            updateAndSaveWeeklyLog(newTodaysLog);

        } catch (err) {
            setError({ title: "Error", message: err.message || 'Failed to process entry.' });
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="bg-slate-50 min-h-screen font-sans text-slate-800 antialiased">
            <div className="container mx-auto max-w-2xl p-4 sm:p-6">
                <Header />
                <main>
                    <InputForm userInput={userInput} setUserInput={setUserInput} onFormSubmit={handleFormSubmit} isLoading={isLoading} isEditing={!!editingItem} onCancelEdit={handleEditCancel}/>
                    {error && <ErrorMessage title={error.title} message={error.message} />}
                    <DailySummary totals={dailyTotals} healthScore={healthScore} goals={goals} onSetGoals={() => setIsGoalsModalOpen(true)} />
                    <FoodLogList log={todaysLog} onEdit={handleEditStart} onDelete={handleDelete}/>
                    <WeeklyLogSummary weeklyLog={weeklyLog} />
                </main>
                {isGoalsModalOpen && <GoalsModal initialGoals={goals} onSave={handleSaveGoals} onClose={() => setIsGoalsModalOpen(false)} userProfile={userProfile} onSaveProfile={handleSaveProfile} />}
            </div>
        </div>
    );
};

// --- Sub-components ---
const Header = () => ( <header className="mb-6 text-center"> <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">AI Nutrition Tracker</h1> <p className="mt-2 text-slate-600">Log your meals and get instant nutritional estimates. Your data is saved in this browser.</p> </header> );

const InputForm = ({ userInput, setUserInput, onFormSubmit, isLoading, isEditing, onCancelEdit }) => ( <form onSubmit={onFormSubmit} className="mb-6"> <div className="relative"> <textarea value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="e.g., 'A bowl of oatmeal with blueberries...'" className="w-full resize-none rounded-xl border-2 border-slate-200 bg-white p-4 pr-48 text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" rows="3" disabled={isLoading} /> <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2"> {isEditing && ( <button type="button" onClick={onCancelEdit} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"> Cancel </button> )} <button type="submit" className="flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow-md transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300" disabled={isLoading || !userInput.trim()}> {isLoading ? <Spinner /> : isEditing ? 'Save Changes' : 'Log Food'} </button> </div> </div> </form> );

const ErrorMessage = ({ title, message }) => (
    <div className="my-4 rounded-lg bg-red-100 p-4 text-red-800 border border-red-200" role="alert">
        <strong className="font-bold block text-base">{title}</strong>
        <p className="text-sm mt-1">{message}</p>
    </div>
);

const DailySummary = ({ totals, healthScore, goals, onSetGoals }) => {
    const goalMetrics = [
        { key: 'calories', label: 'Calories', unit: 'kcal', color: 'sky' },
        { key: 'protein_g', label: 'Protein', unit: 'g', color: 'emerald' },
        { key: 'carbs_g', label: 'Carbs', unit: 'g', color: 'amber' },
        { key: 'fat_g', label: 'Fat', unit: 'g', color: 'rose' },
        { key: 'fiber_g', label: 'Fiber', unit: 'g', color: 'violet' },
    ];
    return (
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-semibold text-slate-800">Today's Progress</h2>
          <button onClick={onSetGoals} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">Set Daily Goals</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {goalMetrics.map(metric => (
                <GoalProgressCard
                    key={metric.key}
                    label={metric.label}
                    currentValue={Math.round(totals[metric.key])}
                    goalValue={goals[metric.key]}
                    unit={metric.unit}
                    color={metric.color}
                />
            ))}
             <div className="rounded-xl p-4 text-center bg-teal-100 text-teal-800 shadow-sm flex flex-col justify-center items-center">
                <p className="text-sm font-medium opacity-80">Health Score</p>
                <p className="text-2xl font-bold tracking-tight my-1">{healthScore} / 100</p>
                <p className="text-xs opacity-70 font-semibold">Based on Goals</p>
            </div>
        </div>
      </div>
    );
};

const GoalProgressCard = ({ label, currentValue, goalValue, unit, color }) => {
    const percent = goalValue > 0 ? (currentValue / goalValue) * 100 : 0;

    let bgColor = `bg-${color}-100`;
    let textColor = `text-${color}-800`;

    if (label === 'Calories' || label === 'Fat') {
        if (percent > 105) { bgColor = 'bg-red-200'; textColor = 'text-red-900'; }
        else if (percent > 90) { bgColor = `bg-${color}-200`; textColor = `text-${color}-900`; }
    } else {
        if (percent >= 100) { bgColor = `bg-green-200`; textColor = 'text-green-900'; }
        else if (percent > 75) { bgColor = `bg-${color}-200`; textColor = `text-${color}-900`; }
    }

    return (
        <div className={`rounded-xl p-4 shadow-sm transition-colors ${bgColor} ${textColor}`}>
            <div className="flex justify-between items-baseline">
                <p className="font-semibold">{label}</p>
                <p className="text-xs opacity-80">{goalValue} {unit} goal</p>
            </div>
            <p className="text-2xl font-bold tracking-tight mt-1">{currentValue}</p>
        </div>
    );
};

const WeeklyLogSummary = ({ weeklyLog }) => {
    const [isOpen, setIsOpen] = useState(false);
    const sortedDates = Object.keys(weeklyLog).sort((a,b) => new Date(b) - new Date(a)).slice(1); // Exclude today

    if (sortedDates.length === 0) return null;

    return (
        <div className="mt-8">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left text-xl font-semibold text-slate-800 mb-3 flex justify-between items-center">
                <span>Past 7 Days</span>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isOpen && (
                <div className="space-y-4">
                    {sortedDates.map(dateStr => {
                        const dayLog = weeklyLog[dateStr];
                        const dayTotals = dayLog.reduce((acc, item) => {
                            acc.calories += item.calories || 0;
                            acc.protein_g += item.protein_g || 0;
                            return acc;
                        }, { calories: 0, protein_g: 0 });
                        return (
                            <div key={dateStr} className="bg-white p-4 rounded-xl border-2 border-slate-200">
                                <p className="font-semibold">{formatDate(dateStr)}</p>
                                <p className="text-sm text-slate-600">
                                    {dayLog.length} items logged &bull;
                                    <span className="font-medium"> {Math.round(dayTotals.calories)} kcal</span> &bull;
                                    <span className="font-medium"> {Math.round(dayTotals.protein_g)}g Protein</span>
                                </p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
};

const FoodLogList = ({ log, onEdit, onDelete }) => ( <div> <h2 className="text-xl font-semibold text-slate-800 mb-3">Today's Log</h2> {log.length === 0 ? ( <p className="text-center text-slate-500 bg-white p-6 rounded-xl border-2 border-slate-200 border-dashed"> Your food log for today is empty. </p> ) : ( <ul className="space-y-3"> {log.map((item) => <FoodLogItem key={item.id} item={item} onEdit={onEdit} onDelete={onDelete}/>)} </ul> )} </div> );

const FoodLogItem = ({ item, onEdit, onDelete }) => {
    return (
        <li className="rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <p className="font-semibold text-slate-900">{item.food_name}</p>
                    <p className="text-sm text-slate-500 italic">"{item.originalQuery}"</p>
                </div>
                <div className="flex-shrink-0 text-right">
                    <p className="font-bold text-lg text-indigo-600">{Math.round(item.calories)}</p>
                    <p className="text-xs text-slate-500 -mt-1">kcal</p>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                <div className="rounded-md bg-emerald-50 p-2"> <span className="font-medium text-emerald-800">{Math.round(item.protein_g)}g</span> <span className="text-emerald-600">P</span> </div>
                <div className="rounded-md bg-amber-50 p-2"> <span className="font-medium text-amber-800">{Math.round(item.carbs_g)}g</span> <span className="text-amber-600">C</span> </div>
                <div className="rounded-md bg-rose-50 p-2"> <span className="font-medium text-rose-800">{Math.round(item.fat_g)}g</span> <span className="text-rose-600">F</span> </div>
                <div className="rounded-md bg-violet-50 p-2"> <span className="font-medium text-violet-800">{Math.round(item.fiber_g || 0)}g</span> <span className="text-violet-600">Fb</span> </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
                 <button onClick={() => onEdit(item)} className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors">Edit</button>
                 <button onClick={() => onDelete(item.id)} className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors">Delete</button>
            </div>
        </li>
    );
};

const getAIGoalRecommendation = async (profile) => {
    const apiKey = "AIzaSyDBQU_V2reiqvz_pgY-BLpu4uDeHInlVss";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `Based on the following user profile, calculate their nutritional goals (calories, protein, carbs, fat, fiber).
    - Age: ${profile.age}
    - Gender: ${profile.gender}
    - Height: ${profile.height} cm
    - Weight: ${profile.weight} kg
    - Activity Level: ${profile.activityLevel}
    - Fitness Goal: ${profile.fitnessGoal}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: "You are a nutritional expert. Calculate BMR using Mifflin-St Jeor, then daily calories using the Harris-Benedict activity multiplier. Adjust calories based on fitness goal (-500 for weight loss, +300 for muscle gain). Set protein to 1.6g/kg for muscle gain, 1.2g/kg otherwise. Set fat to 25% of calories. Fill the rest with carbs. Fiber should be 14g per 1000 calories. Respond ONLY with a JSON object with integer values." }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties: { calories: { "type": "NUMBER" }, protein_g: { "type": "NUMBER" }, carbs_g: { "type": "NUMBER" }, fat_g: { "type": "NUMBER" }, fiber_g: { "type": "NUMBER" } }, required: ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] }
        }
    };
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        const result = await response.json();
        if (result.candidates?.[0]?.content?.parts?.[0]?.text) { return JSON.parse(result.candidates[0].content.parts[0].text); }
        else { throw new Error("Invalid response from AI goal service."); }
    } catch (apiError) {
         console.error("AI Goal Recommendation failed:", apiError);
         return null;
    }
};

const GoalsModal = ({ initialGoals, onSave, onClose, userProfile, onSaveProfile }) => {
    const [goals, setGoals] = useState(initialGoals);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);

    const handleAssistantSave = (recommendedGoals, newProfile) => {
        setGoals(recommendedGoals);
        onSaveProfile(newProfile);
        setIsAssistantOpen(false);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setGoals(prev => ({ ...prev, [name]: value === '' ? '' : parseInt(value, 10) || 0 }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(goals);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
             {isAssistantOpen ? (
                <GoalAssistantModal
                    userProfile={userProfile}
                    onApply={handleAssistantSave}
                    onClose={() => setIsAssistantOpen(false)}
                />
            ) : (
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">Set Your Daily Goals</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <GoalInput label="Calories" name="calories" value={goals.calories} onChange={handleChange} unit="kcal" />
                            <GoalInput label="Protein" name="protein_g" value={goals.protein_g} onChange={handleChange} unit="g" />
                            <GoalInput label="Carbs" name="carbs_g" value={goals.carbs_g} onChange={handleChange} unit="g" />
                            <GoalInput label="Fat" name="fat_g" value={goals.fat_g} onChange={handleChange} unit="g" />
                            <GoalInput label="Fiber" name="fiber_g" value={goals.fiber_g} onChange={handleChange} unit="g" />
                        </div>
                        <div className="mt-6 border-t pt-4">
                            <button type="button" onClick={() => setIsAssistantOpen(true)} className="w-full text-center px-4 py-2 text-sm font-semibold rounded-lg bg-teal-100 text-teal-800 hover:bg-teal-200 transition">
                                ✨ Ask AI Assistant for a Recommendation
                            </button>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                           <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300 transition">Cancel</button>
                           <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition">Save Goals</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};


const GoalAssistantModal = ({ userProfile, onApply, onClose }) => {
    const [profile, setProfile] = useState(userProfile);
    const [isLoading, setIsLoading] = useState(false);
    const [recommendation, setRecommendation] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        const isNumeric = ['age', 'height', 'weight'].includes(name);
        setProfile(prev => ({...prev, [name]: isNumeric ? parseInt(value, 10) || 0 : value }));
    };

    const handleCalculate = async () => {
        setIsLoading(true);
        setRecommendation(null);
        const result = await getAIGoalRecommendation(profile);
        if (result) {
            setRecommendation(result);
        }
        setIsLoading(false);
    };

    const handleApply = () => {
        onApply(recommendation, profile);
    };

    return (
        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">AI Goal Assistant</h2>

            {!recommendation ? (
                <>
                    <p className="text-sm text-slate-600 mb-4">Please provide the following details so our AI can recommend personalized goals for you.</p>
                    <div className="grid grid-cols-2 gap-4">
                        <ProfileInput label="Your Age" type="number" name="age" value={profile.age} onChange={handleChange} />
                        <ProfileSelect label="Your Gender" name="gender" value={profile.gender} onChange={handleChange} options={[{value: 'male', label: 'Male'}, {value: 'female', label: 'Female'}]} />
                        <ProfileInput label="Your Height" type="number" name="height" value={profile.height} onChange={handleChange} unit="cm" />
                        <ProfileInput label="Your Weight" type="number" name="weight" value={profile.weight} onChange={handleChange} unit="kg" />
                        <ProfileSelect
                            label="Daily Activity Level"
                            name="activityLevel"
                            value={profile.activityLevel}
                            onChange={handleChange}
                            options={[
                                {value: 'sedentary', label: 'Sedentary (little exercise)'},
                                {value: 'lightly_active', label: 'Lightly Active (1-3 days/wk)'},
                                {value: 'moderately_active', label: 'Moderately Active (3-5 days/wk)'},
                                {value: 'very_active', label: 'Very Active (6-7 days/wk)'}
                            ]}
                        />
                         <ProfileSelect
                            label="Primary Fitness Goal"
                            name="fitnessGoal"
                            value={profile.fitnessGoal}
                            onChange={handleChange}
                            options={[
                                {value: 'lose', label: 'Weight Loss'},
                                {value: 'maintain', label: 'Maintain Weight'},
                                {value: 'gain', label: 'Muscle Gain'}
                            ]}
                        />
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300">Back</button>
                        <button type="button" onClick={handleCalculate} disabled={isLoading} className="px-4 py-2 text-sm font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-300 flex items-center justify-center">
                            {isLoading ? <Spinner/> : 'Calculate My Goals'}
                        </button>
                    </div>
                </>
            ) : (
                <div>
                    <p className="text-sm text-slate-600 mb-4">Based on your profile, here is our recommendation:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                       <RecommendationCard label="Calories" value={recommendation.calories} unit="kcal" />
                       <RecommendationCard label="Protein" value={recommendation.protein_g} unit="g" />
                       <RecommendationCard label="Carbs" value={recommendation.carbs_g} unit="g" />
                       <RecommendationCard label="Fat" value={recommendation.fat_g} unit="g" />
                       <RecommendationCard label="Fiber" value={recommendation.fiber_g} unit="g" />
                    </div>
                     <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={() => setRecommendation(null)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300">Recalculate</button>
                        <button type="button" onClick={handleApply} className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Apply These Goals</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const ProfileInput = ({ label, type, name, value, onChange, unit }) => (
    <div className="col-span-1">
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="mt-1 relative">
            <input type={type} name={name} id={name} value={value} onChange={onChange} className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2" />
            {unit && <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-slate-500">{unit}</span>}
        </div>
    </div>
);

const ProfileSelect = ({ label, name, value, onChange, options }) => (
    <div className="col-span-1">
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">{label}</label>
        <select id={name} name={name} value={value} onChange={onChange} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2">
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

const RecommendationCard = ({ label, value, unit }) => (
    <div className="bg-slate-100 rounded-lg p-3">
        <p className="text-sm text-slate-600">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value} <span className="text-base font-normal text-slate-500">{unit}</span></p>
    </div>
);

const GoalInput = ({ label, name, value, onChange, unit }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">{label}</label>
        <div className="mt-1 relative rounded-md shadow-sm">
            <input type="number" name={name} id={name} value={value} onChange={onChange} className="w-full rounded-md border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2" />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">{unit}</span>
            </div>
        </div>
    </div>
);
const Spinner = () => ( <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> );


export default App;

