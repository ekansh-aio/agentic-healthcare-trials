/**
 * Public Survey Page — /survey/:campaignId
 *
 * Step 1: Show questionnaire MCQ questions for the campaign.
 * Step 2: Show registration form (name, age, sex, phone) after questionnaire.
 * Step 3: Submit to POST /api/advertisements/:id/survey-responses.
 * Step 4: Thank-you screen.
 *
 * No authentication required.
 */

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { surveyAPI } from "../../services/api";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ── Fetch campaign data (public, no auth) ─────────────────────────────────────
async function fetchCampaign(adId) {
  const res = await fetch(`${API_BASE}/advertisements/${adId}/public`);
  if (!res.ok) throw new Error("Campaign not found");
  return res.json();
}

// ── Inline styles ─────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "40px 16px",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 600,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  header: {
    padding: "28px 32px 20px",
    borderBottom: "1px solid #e5e7eb",
  },
  title: { fontSize: "1.25rem", fontWeight: 700, color: "#111827", margin: 0, marginBottom: 4 },
  subtitle: { fontSize: "0.85rem", color: "#6b7280", margin: 0 },
  body: { padding: "28px 32px" },
  label: { display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" },
  input: {
    width: "100%", padding: "10px 14px", fontSize: "0.9rem",
    border: "1.5px solid #d1d5db", borderRadius: 8,
    outline: "none", color: "#111827", backgroundColor: "#fff",
    boxSizing: "border-box", transition: "border-color 0.15s",
  },
  select: {
    width: "100%", padding: "10px 14px", fontSize: "0.9rem",
    border: "1.5px solid #d1d5db", borderRadius: 8,
    outline: "none", color: "#111827", backgroundColor: "#fff",
    boxSizing: "border-box", appearance: "none",
  },
  btn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "100%", padding: "12px 20px", borderRadius: 10,
    fontSize: "0.92rem", fontWeight: 600, cursor: "pointer",
    border: "none", transition: "opacity 0.15s",
  },
  btnPrimary: { backgroundColor: "#4f46e5", color: "#fff" },
  btnDisabled: { backgroundColor: "#9ca3af", color: "#fff", cursor: "not-allowed" },
  optionBtn: (selected, eligible) => ({
    width: "100%", textAlign: "left", padding: "10px 14px",
    borderRadius: 8, cursor: "pointer", fontSize: "0.87rem",
    border: selected
      ? eligible === false
        ? "2px solid #dc2626"
        : "2px solid #4f46e5"
      : "1.5px solid #e5e7eb",
    backgroundColor: selected
      ? eligible === false
        ? "rgba(220,38,38,0.06)"
        : "rgba(79,70,229,0.06)"
      : "#fff",
    color: "#111827", transition: "all 0.12s",
    fontWeight: selected ? 600 : 400,
  }),
  error: {
    padding: "12px 16px", borderRadius: 8, backgroundColor: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#dc2626",
    fontSize: "0.83rem", marginBottom: 16,
  },
  success: {
    padding: "12px 16px", borderRadius: 8, backgroundColor: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.25)", color: "#16a34a",
    fontSize: "0.83rem", marginBottom: 16,
  },
};

// ── Step 1: Questionnaire ─────────────────────────────────────────────────────
function QuestionnaireStep({ questions, onComplete }) {
  const [answers, setAnswers]   = useState({});   // { question_id: option_index }
  const [current, setCurrent]   = useState(0);
  const [error, setError]       = useState("");

  const q = questions[current];
  if (!q) return null;

  const totalAnswered = Object.keys(answers).length;
  const progress      = Math.round((totalAnswered / questions.length) * 100);

  const handleSelect = (optIdx) => {
    setAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
    setError("");
  };

  const handleNext = () => {
    if (answers[q.id] === undefined) {
      setError("Please select an answer to continue.");
      return;
    }
    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      // Build answer payload
      const answerList = questions.map((question) => {
        const chosenIdx   = answers[question.id];
        const chosenText  = question.options[chosenIdx] ?? "";
        const isEligible  = question.correct_option !== undefined
          ? chosenIdx === question.correct_option
          : null;
        return {
          question_id:     question.id,
          question_text:   question.text,
          selected_option: chosenText,
          is_eligible:     isEligible,
        };
      });
      const overallEligible = answerList.every((a) => a.is_eligible !== false);
      onComplete(answerList, overallEligible);
    }
  };

  const handleBack = () => { setCurrent((c) => Math.max(0, c - 1)); setError(""); };

  const selectedIdx = answers[q.id];

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>Question {current + 1} of {questions.length}</span>
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>{progress}% complete</span>
        </div>
        <div style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 999 }}>
          <div style={{ height: "100%", width: `${progress}%`, backgroundColor: "#4f46e5", borderRadius: 999, transition: "width 0.3s" }} />
        </div>
      </div>

      <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#111827", marginBottom: 18, lineHeight: 1.5 }}>
        {q.text}
        {q.required && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            style={s.optionBtn(selectedIdx === i, selectedIdx === i && q.correct_option !== undefined ? i === q.correct_option ? null : false : null)}
          >
            <span style={{ marginRight: 10, fontWeight: 700, color: "#9ca3af" }}>{String.fromCharCode(65 + i)}.</span>
            {opt}
          </button>
        ))}
      </div>

      {error && <p style={s.error}>{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        {current > 0 && (
          <button onClick={handleBack} style={{ ...s.btn, flex: 1, backgroundColor: "#f3f4f6", color: "#374151" }}>
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          style={{ ...s.btn, flex: 2, ...(selectedIdx === undefined ? s.btnDisabled : s.btnPrimary) }}
        >
          {current === questions.length - 1 ? "Submit Answers" : "Next"}
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Registration form ─────────────────────────────────────────────────
function RegistrationStep({ adId, surveyAnswers, isEligible, onSubmitted }) {
  const [form, setForm]     = useState({ full_name: "", age: "", sex: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.full_name.trim()) { setError("Please enter your full name."); return; }
    const age = parseInt(form.age, 10);
    if (!form.age || isNaN(age) || age < 1 || age > 120) { setError("Please enter a valid age."); return; }
    if (!form.sex) { setError("Please select your sex."); return; }
    if (!form.phone.trim() || form.phone.trim().length < 5) { setError("Please enter a valid phone number."); return; }

    setLoading(true);
    try {
      const response = await surveyAPI.submit(adId, {
        full_name:   form.full_name.trim(),
        age,
        sex:         form.sex,
        phone:       form.phone.trim(),
        answers:     surveyAnswers,
        is_eligible: isEligible,
      });
      onSubmitted(response.id, form.full_name.trim(), form.phone.trim());
    } catch (err) {
      setError(err.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = (focused) => ({
    ...s.input,
    borderColor: focused ? "#4f46e5" : "#d1d5db",
  });

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ padding: "12px 16px", borderRadius: 8, backgroundColor: isEligible ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${isEligible ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, color: isEligible ? "#16a34a" : "#dc2626", fontSize: "0.85rem", fontWeight: 500 }}>
        {isEligible
          ? "Great news — you appear to be eligible! Please fill in your details so the study team can reach you."
          : "Thank you for completing the survey. Please fill in your details so the study team can contact you with more information."}
      </div>

      <div>
        <label style={s.label}>Full Name *</label>
        <input
          type="text"
          value={form.full_name}
          onChange={set("full_name")}
          placeholder="e.g. Jane Smith"
          style={s.input}
          required
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={s.label}>Age *</label>
          <input
            type="number"
            value={form.age}
            onChange={set("age")}
            placeholder="e.g. 34"
            min={1} max={120}
            style={s.input}
            required
          />
        </div>
        <div>
          <label style={s.label}>Sex *</label>
          <select value={form.sex} onChange={set("sex")} style={s.select} required>
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
      </div>

      <div>
        <label style={s.label}>Phone Number *</label>
        <input
          type="tel"
          value={form.phone}
          onChange={set("phone")}
          placeholder="e.g. +1 555 123 4567"
          style={s.input}
          required
        />
      </div>

      {error && <p style={s.error}>{error}</p>}

      <button
        type="submit"
        disabled={loading}
        style={{ ...s.btn, ...(loading ? s.btnDisabled : s.btnPrimary) }}
      >
        {loading ? "Submitting…" : "Submit Details"}
      </button>

      <p style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "center", lineHeight: 1.5 }}>
        Your information will only be used by the study team to contact you about this trial.
        It will not be shared with third parties.
      </p>
    </form>
  );
}

// ── Step 3: Book Appointment ─────────────────────────────────────────────────
function BookingStep({ adId, surveyResponseId, patientName, patientPhone, onBooked, onSkip, windowStart, windowEnd }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots]               = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking]           = useState(false);
  const [error, setError]               = useState("");

  // Build date options from the campaign booking window only
  const dateOptions = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = windowStart ? new Date(windowStart + "T00:00:00") : today;
    const end   = windowEnd   ? new Date(windowEnd   + "T00:00:00") : new Date(today.getTime() + 30 * 86400000);
    const from  = start < today ? today : start;
    const opts  = [];
    const cur   = new Date(from);
    while (cur <= end && opts.length < 120) {
      opts.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return opts;
  })();

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setError("");

    fetch(`${API_BASE}/advertisements/${adId}/appointments/slots?date=${selectedDate}`)
      .then((r) => {
        if (!r.ok) {
          return r.json().catch(() => ({})).then((err) => {
            throw new Error(err.detail || `HTTP ${r.status}: ${r.statusText}`);
          });
        }
        return r.json();
      })
      .then((data) => setSlots(data.slots || []))
      .catch((err) => {
        console.error("Slot fetch error:", err);
        setError(err.message || "Could not load available slots. Please try again.");
      })
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, adId]);

  const handleBook = async () => {
    if (!selectedSlot) {
      setError("Please select a time slot.");
      return;
    }

    setBooking(true);
    setError("");

    try {
      const slotDatetime = new Date(`${selectedDate}T${selectedSlot}:00`).toISOString();
      const res = await fetch(`${API_BASE}/advertisements/${adId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name:       patientName,
          patient_phone:      patientPhone,
          slot_datetime:      slotDatetime,
          survey_response_id: surveyResponseId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Booking failed");
      }

      onBooked();
    } catch (err) {
      setError(err.message || "Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ padding: "12px 16px", borderRadius: 8, backgroundColor: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.25)", color: "#4f46e5", fontSize: "0.85rem", fontWeight: 500 }}>
        Schedule your first visit with the study team. Choose a date and time that works for you.
      </div>

      {/* Date picker */}
      <div>
        <label style={s.label}>Select Date *</label>
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={s.select}
        >
          <option value="">Choose a date…</option>
          {dateOptions.map((d) => (
            <option key={d} value={d}>
              {new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </option>
          ))}
        </select>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <label style={s.label}>Select Time Slot *</label>
          {loadingSlots ? (
            <p style={{ fontSize: "0.85rem", color: "#6b7280", padding: "12px 0" }}>Loading available slots…</p>
          ) : slots.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "#dc2626", padding: "12px 0" }}>No slots available for this date.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginTop: 8 }}>
              {slots.filter((s) => s.available).map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() => setSelectedSlot(slot.time)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: selectedSlot === slot.time ? "2px solid #4f46e5" : "1.5px solid #e5e7eb",
                    backgroundColor: selectedSlot === slot.time ? "rgba(79,70,229,0.06)" : "#fff",
                    color: "#111827",
                    fontSize: "0.85rem",
                    fontWeight: selectedSlot === slot.time ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p style={s.error}>{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          type="button"
          onClick={onSkip}
          style={{ ...s.btn, flex: 1, backgroundColor: "#f3f4f6", color: "#6b7280", fontSize: "0.85rem" }}
        >
          Skip for Now
        </button>
        <button
          type="button"
          onClick={handleBook}
          disabled={booking || !selectedSlot}
          style={{ ...s.btn, flex: 2, ...(booking || !selectedSlot ? s.btnDisabled : s.btnPrimary) }}
        >
          {booking ? "Booking…" : "Confirm Appointment"}
        </button>
      </div>

      <p style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "center", lineHeight: 1.5 }}>
        You can always reschedule by contacting the study team directly.
      </p>
    </div>
  );
}

// ── Step 4: Thank you ─────────────────────────────────────────────────────────
function ThankYouStep({ appointmentBooked }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#111827", marginBottom: 8 }}>
        Thank you!
      </h2>
      <p style={{ fontSize: "0.88rem", color: "#6b7280", lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
        {appointmentBooked
          ? "Your appointment has been confirmed. You will receive a reminder from the study team."
          : "Your responses have been received. A member of the study team will be in touch with you shortly."}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SurveyPage() {
  const { campaignId } = useParams();

  const [campaign, setCampaign] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState("questionnaire");  // "questionnaire" | "registration" | "booking" | "done"
  const [surveyAnswers, setSurveyAnswers] = useState([]);
  const [isEligible, setIsEligible] = useState(null);
  const [surveyResponseId, setSurveyResponseId] = useState(null);
  const [patientInfo, setPatientInfo] = useState({ name: "", phone: "" });
  const [appointmentBooked, setAppointmentBooked] = useState(false);

  useEffect(() => {
    fetchCampaign(campaignId)
      .then(setCampaign)
      .catch(() => setLoadError("This survey link is not valid or has expired."));
  }, [campaignId]);

  const questions = campaign?.questionnaire?.questions || [];

  const handleQuestionnaireComplete = (answers, eligible) => {
    setSurveyAnswers(answers);
    setIsEligible(eligible);
    setStep("registration");
  };

  if (loadError) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.body}>
            <p style={{ ...s.error, marginBottom: 0 }}>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.body}>
            <p style={{ color: "#6b7280", textAlign: "center", padding: "24px 0" }}>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  const stepTitles = {
    questionnaire: { title: "Eligibility Survey",   sub: campaign.title },
    registration:  { title: "Your Details",         sub: "Help us get in touch with you" },
    booking:       { title: "Book Your Appointment", sub: "Schedule your first visit" },
    done:          { title: "All Done",              sub: campaign.title },
  };
  const { title, sub } = stepTitles[step];

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <h1 style={s.title}>{title}</h1>
          <p style={s.subtitle}>{sub}</p>
        </div>
        <div style={s.body}>
          {step === "questionnaire" && questions.length > 0 && (
            <QuestionnaireStep questions={questions} onComplete={handleQuestionnaireComplete} />
          )}
          {step === "questionnaire" && questions.length === 0 && (
            <p style={{ color: "#6b7280", textAlign: "center", padding: "24px 0" }}>
              No questionnaire is available for this campaign.
            </p>
          )}
          {step === "registration" && (
            <RegistrationStep
              adId={campaignId}
              surveyAnswers={surveyAnswers}
              isEligible={isEligible}
              onSubmitted={(responseId, name, phone) => {
                setSurveyResponseId(responseId);
                setPatientInfo({ name, phone });
                setStep("booking");
              }}
            />
          )}
          {step === "booking" && (
            <BookingStep
              adId={campaignId}
              surveyResponseId={surveyResponseId}
              patientName={patientInfo.name}
              patientPhone={patientInfo.phone}
              windowStart={campaign?.booking_window_start}
              windowEnd={campaign?.booking_window_end}
              onBooked={() => {
                setAppointmentBooked(true);
                setStep("done");
              }}
              onSkip={() => setStep("done")}
            />
          )}
          {step === "done" && <ThankYouStep appointmentBooked={appointmentBooked} />}
        </div>
      </div>
    </div>
  );
}
