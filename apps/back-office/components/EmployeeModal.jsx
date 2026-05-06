"use client";

import { useState } from "react";
import { useEffect } from "react";

import { saveEmployee } from "../app/actions/mnrActions";

export default function EmployeeModal({ isOpen, onClose, employee }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoading(false);
      setErrorMessage("");
    }
  }, [isOpen, employee?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErrorMessage("");
    const formData = new FormData(e.target);
    if (employee?.id) formData.append("id", employee.id);

    try {
      await saveEmployee(formData);
      onClose();
    } catch (error) {
      setErrorMessage(error?.message || "Failed to save employee.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {employee ? "Edit Employee" : "Add Employee"}
        </h2>
        {errorMessage ? (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
            {errorMessage}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Full Name</label>
            <input
              type="text"
              name="full_name"
              defaultValue={employee?.full_name}
              required
              className="w-full border p-2 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Role</label>
            <select
              name="role"
              defaultValue={employee?.role || "Guard"}
              className="w-full border p-2 rounded"
            >
              <option value="Guard">Guard</option>
              <option value="OM">Operations Manager</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">
              NIC (Will be encrypted)
            </label>
            <input
              type="text"
              name="nic"
              defaultValue={employee?.nic}
              required
              className="w-full border p-2 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              Phone (Will be encrypted)
            </label>
            <input
              type="text"
              name="phone"
              defaultValue={employee?.phone}
              required
              className="w-full border p-2 rounded"
            />
          </div>
          <div className="flex justify-end space-x-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-600 border rounded disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save Vault Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

