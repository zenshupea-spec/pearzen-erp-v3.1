"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getEmployees, terminateEmployee } from "../../actions/mnrActions";
import EmployeeModal from "../../../components/EmployeeModal";

export default function MasterNominalRoll() {
  const [employees, setEmployees] = useState([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [processingIds, setProcessingIds] = useState({});
  const requestIdRef = useRef(0);

  const fetchEmployees = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getEmployees();
      if (requestIdRef.current === requestId) {
        setEmployees(data);
      }
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setErrorMessage(error?.message || "Failed to fetch employees.");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    if (!isModalOpen) {
      fetchEmployees();
    }
  }, [isModalOpen, fetchEmployees]);

  const handleStatusChange = async (id, status) => {
    if (processingIds[id]) return;

    // Simulated Debt Check for Resignation Requirement
    let debt = 0;
    if (status === "Resigned") {
      const confirmDebt = confirm(
        "Run Resignation Debt Check? (Click OK to simulate NO debt, Cancel to simulate 5000 LKR debt)"
      );
      debt = confirmDebt ? 0 : 5000;
    }

    setProcessingIds((prev) => ({ ...prev, [id]: true }));
    setErrorMessage("");

    try {
      await terminateEmployee(id, status, debt);
      await fetchEmployees();
    } catch (error) {
      setErrorMessage(error?.message || "Failed to update employee status.");
    } finally {
      setProcessingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Master Nominal Roll (MNR)</h1>
        <button
          onClick={() => {
            setSelectedEmp(null);
            setModalOpen(true);
          }}
          className="bg-black text-white px-4 py-2 rounded"
        >
          + Add Employee
        </button>
      </div>

      <div className="bg-white shadow overflow-x-auto rounded-lg">
        {errorMessage ? (
          <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {errorMessage}
          </div>
        ) : null}
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading employees...</div>
        ) : null}
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">NIC (Decrypted)</th>
              <th className="px-4 py-3">Phone (Decrypted)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-4 py-3 font-medium">{emp.full_name}</td>
                <td className="px-4 py-3">{emp.role}</td>
                <td className="px-4 py-3 font-mono">{emp.nic}</td>
                <td className="px-4 py-3 font-mono">{emp.phone}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      emp.status === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {emp.status}
                  </span>
                </td>
                <td className="px-4 py-3 space-x-2">
                  <button
                    onClick={() => {
                      setSelectedEmp(emp);
                      setModalOpen(true);
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  {emp.status === "Active" && (
                    <>
                      <button
                        onClick={() => handleStatusChange(emp.id, "Resigned")}
                        disabled={Boolean(processingIds[emp.id])}
                        className="text-orange-600 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Resign
                      </button>
                      <button
                        onClick={() => handleStatusChange(emp.id, "Terminated")}
                        disabled={Boolean(processingIds[emp.id])}
                        className="text-red-600 hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Terminate
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        employee={selectedEmp}
      />
    </div>
  );
}

