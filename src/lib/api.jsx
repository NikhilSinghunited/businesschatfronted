import axios from "axios";

const BASE = "http://127.0.0.1:8000";

export async function requestInstall(user_query, chosen_version = null) {
  const { data } = await axios.post(`${BASE}/request_install`, {
    user_query,
    chosen_version,
  });
  return data; // can be {incident,...} or {options:[...], message:...}
}

export async function createTicket(user_query) {
  const { data } = await axios.post(`${BASE}/create_ticket`, {
    short_description: user_query,
    description: user_query,
    impact: "2",
    category: "Software",
  });
  return data; // {incident: "INC...", ...}
}

export async function showStatus(incidentId) {
  const { data } = await axios.get(`${BASE}/show_status/${incidentId}`);
  return data; // {incident_status:"..."}
}
